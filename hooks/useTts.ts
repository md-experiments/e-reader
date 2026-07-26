'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sentence } from '@/lib/tts';

export type TtsEngine = 'webspeech' | 'kokoro';
export type TtsStatus = 'stopped' | 'playing' | 'paused';

export interface KokoroLoadState {
  state: 'idle' | 'loading' | 'ready' | 'error';
  progress: number; // 0–100 across all model files
  error?: string;
}

export const KOKORO_VOICES: { id: string; label: string }[] = [
  { id: 'af_heart', label: 'Heart (US female)' },
  { id: 'af_bella', label: 'Bella (US female)' },
  { id: 'af_nicole', label: 'Nicole (US female, soft)' },
  { id: 'am_michael', label: 'Michael (US male)' },
  { id: 'am_fenrir', label: 'Fenrir (US male)' },
  { id: 'bf_emma', label: 'Emma (UK female)' },
  { id: 'bm_george', label: 'George (UK male)' },
];

// ── Kokoro singleton (module-level so the model survives remounts) ───────────

interface KokoroModelLike {
  generate(text: string, options: { voice: string }): Promise<{ toWav(): ArrayBuffer }>;
}

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

export type KokoroBackend = 'webgpu' | 'wasm';

let kokoroInstance: KokoroModelLike | null = null;
let kokoroPromise: Promise<KokoroModelLike> | null = null;
let kokoroActiveBackend: KokoroBackend | null = null;

export function isKokoroReady(): boolean {
  return kokoroInstance !== null;
}

// WebGPU is typically 5–20× faster than WASM for this model, but requires the
// fp32 weights (~330 MB download, ~1 GB in memory) — quantized weights aren't
// reliable on the WebGPU backend. Skip it on low-memory devices: deviceMemory
// is clamped to powers of two, so a 6 GB phone reports 4 and an 8 GB laptop
// reports 8.
let backendPromise: Promise<KokoroBackend> | null = null;
export function detectKokoroBackend(): Promise<KokoroBackend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        if (typeof navigator === 'undefined') return 'wasm';
        const nav = navigator as Navigator & {
          gpu?: { requestAdapter(): Promise<unknown | null> };
          deviceMemory?: number;
        };
        if (nav.deviceMemory !== undefined && nav.deviceMemory < 8) return 'wasm';
        if (!nav.gpu) return 'wasm';
        return (await nav.gpu.requestAdapter()) ? 'webgpu' : 'wasm';
      } catch {
        return 'wasm';
      }
    })();
  }
  return backendPromise;
}

interface DownloadProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function loadKokoro(onProgress?: (pct: number) => void): Promise<KokoroModelLike> {
  if (kokoroInstance) return Promise.resolve(kokoroInstance);
  if (!kokoroPromise) {
    kokoroPromise = (async () => {
      const { KokoroTTS } = await import('kokoro-js');

      const attempt = async (device: KokoroBackend): Promise<KokoroModelLike> => {
        const perFile = new Map<string, { loaded: number; total: number }>();
        const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
          dtype: device === 'webgpu' ? 'fp32' : 'q8',
          device,
          progress_callback: (p: DownloadProgress) => {
            if (p.status !== 'progress' || !p.file || !p.total) return;
            perFile.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
            let loaded = 0;
            let total = 0;
            for (const f of perFile.values()) {
              loaded += f.loaded;
              total += f.total;
            }
            if (total > 0) onProgress?.(Math.round((loaded / total) * 100));
          },
        });
        kokoroActiveBackend = device;
        return tts as unknown as KokoroModelLike;
      };

      const backend = await detectKokoroBackend();
      if (backend === 'webgpu') {
        try {
          kokoroInstance = await attempt('webgpu');
          return kokoroInstance;
        } catch {
          // GPU init can fail on flaky drivers — fall back to CPU/WASM
        }
      }
      kokoroInstance = await attempt('wasm');
      return kokoroInstance;
    })().catch((e) => {
      kokoroPromise = null;
      throw e;
    });
  }
  return kokoroPromise;
}

// Tiny silent WAV used to unlock the audio element inside the user gesture,
// since the first real Kokoro clip only arrives after async generation and
// iOS Safari rejects play() calls that aren't gesture-adjacent.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseTtsArgs {
  sentences: Sentence[];
  engine: TtsEngine;
  rate: number;
  webVoiceURI: string | null;
  kokoroVoice: string;
  /** BCP-47 language of the content being read (e.g. 'bg' for a translation).
   *  When set, the device engine prefers a voice matching this language over
   *  the user's saved voice, so translated text isn't read with an
   *  English voice. Undefined = no preference (use the saved voice). */
  lang?: string;
  /** Called when the last sentence of the page finishes. Return true if the
   *  reader is advancing to another page (playback then auto-continues). */
  onPageComplete: () => boolean;
  /** Shown on the lock screen / notification media controls (Media Session). */
  mediaTitle?: string;
  mediaArtist?: string;
}

export function useTts({
  sentences,
  engine,
  rate,
  webVoiceURI,
  kokoroVoice,
  lang,
  onPageComplete,
  mediaTitle,
  mediaArtist,
}: UseTtsArgs) {
  const [status, setStatus] = useState<TtsStatus>('stopped');
  const [busy, setBusy] = useState(false); // waiting on model load / generation
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [kokoroLoad, setKokoroLoad] = useState<KokoroLoadState>({
    state: isKokoroReady() ? 'ready' : 'idle',
    progress: isKokoroReady() ? 100 : 0,
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Set in an effect (not read from window during render) to keep SSR and
  // client renders identical.
  const [supported, setSupported] = useState(true);
  // Which backend Kokoro will use (or is using) on this device — lets the UI
  // show the right download size before the user opts in.
  const [kokoroBackend, setKokoroBackend] = useState<KokoroBackend | null>(kokoroActiveBackend);
  useEffect(() => {
    detectKokoroBackend().then((b) => setKokoroBackend(kokoroActiveBackend ?? b));
  }, []);

  // Session token: bumped on every play/pause/stop/page-change so stale async
  // callbacks (utterance onend, audio onended, generation promises) are ignored.
  const sessionRef = useRef(0);
  const statusRef = useRef<TtsStatus>('stopped');
  const indexRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null); // prevents GC-before-onend (Chrome quirk)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map()); // sentence idx → object URL
  const pendingGenRef = useRef<Map<number, Promise<string>>>(new Map());
  const genChainRef = useRef<Promise<unknown>>(Promise.resolve()); // serialise WASM inference
  const pageGenRef = useRef(0); // invalidates cached audio when sentences change
  // Stall detection (see the watchdog effect below)
  const busyRef = useRef(busy);
  const lastProgressRef = useRef(0); // ms timestamp of the last sign of life
  const sawBoundaryRef = useRef(false); // does this device emit word-boundary events?

  const sentencesRef = useRef(sentences);
  const engineRef = useRef(engine);
  const rateRef = useRef(rate);
  const webVoiceRef = useRef(webVoiceURI);
  const kokoroVoiceRef = useRef(kokoroVoice);
  const langRef = useRef(lang);
  const voicesRef = useRef(voices);
  const onPageCompleteRef = useRef(onPageComplete);
  useEffect(() => {
    busyRef.current = busy;
    sentencesRef.current = sentences;
    engineRef.current = engine;
    rateRef.current = rate;
    webVoiceRef.current = webVoiceURI;
    kokoroVoiceRef.current = kokoroVoice;
    langRef.current = lang;
    voicesRef.current = voices;
    onPageCompleteRef.current = onPageComplete;
  });

  const setStatusBoth = (s: TtsStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const getAudioEl = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }, []);

  // Recursion happens through this ref so playback callbacks (onend/onended)
  // always invoke the latest speakSentence without a self-reference.
  const speakSentenceRef = useRef<(idx: number, session: number) => void>(() => {});

  // System voices (Chrome populates them asynchronously)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      const id = setTimeout(() => setSupported(false), 0);
      return () => clearTimeout(id);
    }
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const clearAudioCache = useCallback(() => {
    for (const url of audioCacheRef.current.values()) URL.revokeObjectURL(url);
    audioCacheRef.current.clear();
    pendingGenRef.current.clear();
    pageGenRef.current++;
  }, []);

  const ensureKokoro = useCallback(async (): Promise<KokoroModelLike> => {
    if (!isKokoroReady()) {
      setKokoroLoad((s) => (s.state === 'loading' ? s : { state: 'loading', progress: 0 }));
    }
    try {
      const model = await loadKokoro((pct) =>
        setKokoroLoad((s) => (s.state === 'ready' ? s : { state: 'loading', progress: pct })),
      );
      setKokoroLoad({ state: 'ready', progress: 100 });
      setKokoroBackend(kokoroActiveBackend);
      return model;
    } catch (e) {
      setKokoroLoad({ state: 'error', progress: 0, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }, []);

  const getKokoroAudio = useCallback(
    (idx: number): Promise<string> => {
      const cached = audioCacheRef.current.get(idx);
      if (cached) return Promise.resolve(cached);
      let pending = pendingGenRef.current.get(idx);
      if (!pending) {
        const pageGen = pageGenRef.current;
        const sentence = sentencesRef.current[idx];
        pending = (async () => {
          const model = await ensureKokoro();
          // Serialise inference calls — concurrent generate() on one WASM
          // session interleaves badly.
          const run = genChainRef.current.then(() =>
            model.generate(sentence.text, { voice: kokoroVoiceRef.current }),
          );
          genChainRef.current = run.catch(() => {});
          const audio = await run;
          const url = URL.createObjectURL(new Blob([audio.toWav()], { type: 'audio/wav' }));
          if (pageGen !== pageGenRef.current) {
            URL.revokeObjectURL(url);
            throw new Error('stale');
          }
          audioCacheRef.current.set(idx, url);
          return url;
        })().finally(() => pendingGenRef.current.delete(idx));
        pendingGenRef.current.set(idx, pending);
      }
      return pending;
    },
    [ensureKokoro],
  );

  // Generate the rest of the page in the background while audio plays, so on
  // slow devices the buffer builds up instead of stalling before each
  // sentence. Generation is already serialised through genChainRef, and the
  // session check aborts the loop on pause/stop/page change.
  const prefetchFrom = useCallback(
    (from: number, session: number) => {
      void (async () => {
        for (let i = from; i < sentencesRef.current.length; i++) {
          if (session !== sessionRef.current) return;
          if (audioCacheRef.current.has(i)) continue;
          try {
            await getKokoroAudio(i);
          } catch {
            return; // playback path surfaces model errors
          }
        }
      })();
    },
    [getKokoroAudio],
  );

  const finishPage = useCallback(() => {
    const advancing = onPageCompleteRef.current();
    if (!advancing) {
      indexRef.current = 0;
      setActiveIndex(null);
      setBusy(false);
      setStatusBoth('stopped');
    }
    // else: keep status 'playing'; the sentences-change effect restarts on the new page
  }, []);

  const speakSentence = useCallback(
    (idx: number, session: number) => {
      if (session !== sessionRef.current) return;
      const list = sentencesRef.current;
      if (idx >= list.length) {
        finishPage();
        return;
      }
      indexRef.current = idx;
      setActiveIndex(idx);

      if (engineRef.current === 'webspeech') {
        const u = new SpeechSynthesisUtterance(list[idx].text);
        u.rate = rateRef.current;
        const contentLang = langRef.current?.toLowerCase();
        let voice = voicesRef.current.find((v) => v.voiceURI === webVoiceRef.current);
        if (contentLang) {
          // Content language wins over the saved voice: drop a mismatched
          // saved voice and pick one that can actually speak this language.
          if (voice && !voice.lang.toLowerCase().startsWith(contentLang)) voice = undefined;
          if (!voice) {
            const matches = voicesRef.current.filter((v) => v.lang.toLowerCase().startsWith(contentLang));
            voice = matches.find((v) => v.default) ?? matches[0];
          }
        }
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else if (contentLang) {
          // No matching installed voice — let the engine resolve the language
          u.lang = contentLang;
        }
        u.onstart = () => {
          lastProgressRef.current = Date.now();
        };
        // Not every device fires boundary events; when they do fire they are
        // the only reliable proof that the engine is still producing audio.
        u.onboundary = () => {
          sawBoundaryRef.current = true;
          lastProgressRef.current = Date.now();
        };
        u.onend = () => {
          if (session === sessionRef.current) speakSentenceRef.current(idx + 1, session);
        };
        u.onerror = (e) => {
          if (session !== sessionRef.current) return;
          if (e.error === 'interrupted' || e.error === 'canceled') return;
          if (e.error === 'not-allowed' || e.error === 'audio-busy') {
            setStatusBoth('stopped');
            setActiveIndex(null);
            return;
          }
          speakSentenceRef.current(idx + 1, session); // skip a sentence the engine chokes on
        };
        utteranceRef.current = u;
        lastProgressRef.current = Date.now();
        window.speechSynthesis.speak(u);
      } else {
        setBusy(true);
        (async () => {
          try {
            const url = await getKokoroAudio(idx);
            if (session !== sessionRef.current) return;
            setBusy(false);
            const audio = getAudioEl();
            audio.src = url;
            audio.playbackRate = rateRef.current;
            audio.onended = () => {
              if (session === sessionRef.current) speakSentenceRef.current(idx + 1, session);
            };
            audio.onerror = () => {
              if (session === sessionRef.current) speakSentenceRef.current(idx + 1, session);
            };
            lastProgressRef.current = Date.now();
            await audio.play();
            prefetchFrom(idx + 1, session);
          } catch {
            if (session !== sessionRef.current) return;
            setBusy(false);
            setActiveIndex(null);
            setStatusBoth('stopped');
          }
        })();
      }
    },
    [finishPage, getKokoroAudio, getAudioEl, prefetchFrom],
  );

  useEffect(() => {
    speakSentenceRef.current = speakSentence;
  }, [speakSentence]);

  const play = useCallback(
    (fromIndex?: number) => {
      if (sentencesRef.current.length === 0) return;
      const session = ++sessionRef.current;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (engineRef.current === 'kokoro') {
        // Unlock the audio element inside the user gesture (iOS Safari)
        const audio = getAudioEl();
        if (audio.paused && !audioCacheRef.current.has(fromIndex ?? indexRef.current)) {
          audio.src = SILENT_WAV;
          audio.play().catch(() => {});
        }
      } else {
        audioRef.current?.pause();
      }
      setBusy(false); // clear a waiting-for-content hold
      setStatusBoth('playing');
      speakSentence(fromIndex ?? indexRef.current, session);
    },
    [speakSentence, getAudioEl],
  );

  const pause = useCallback(() => {
    ++sessionRef.current;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    audioRef.current?.pause();
    setBusy(false);
    setStatusBoth('paused'); // activeIndex stays put so the highlight remains
  }, []);

  // Move the playhead without starting playback — used to restore a saved
  // listening position, so the next play() picks up where the user left off.
  // Deliberately does not touch activeIndex: highlighting (and its scroll)
  // would fight the reader's own saved scroll position on load.
  const seek = useCallback((index: number) => {
    const list = sentencesRef.current;
    if (list.length === 0) return;
    indexRef.current = Math.min(Math.max(0, index), list.length - 1);
  }, []);

  // Where playback should resume when the sentence list is next replaced (a
  // page turn, or a switch between the original text and its translation).
  // Expressed as a fraction of the page so it carries across a translation
  // with a different sentence count. Cleared once consumed.
  const resumeFractionRef = useRef<number | null>(null);
  const setResumeFraction = useCallback((fraction: number | null) => {
    resumeFractionRef.current = fraction;
  }, []);

  const stop = useCallback(() => {
    ++sessionRef.current;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    indexRef.current = 0;
    setActiveIndex(null);
    setBusy(false);
    setStatusBoth('stopped');
  }, []);

  // ── Screen-off / background recovery ────────────────────────────────────────
  // When a phone locks its screen the speech engine is suspended and JS timers
  // are frozen: playback dies mid-page with no 'end' and no 'error' event, so
  // the reader would sit silently in its 'playing' state forever. A screen wake
  // lock (useWakeLock) normally prevents the lock in the first place, but it
  // isn't available on every browser and the user can always press the power
  // button — so watch for playback that has gone quiet and pick it back up from
  // the sentence it died on. Applies to both engines and to any language,
  // including the Bulgarian translation view.
  useEffect(() => {
    if (status !== 'playing') return;

    let quiet = 0; // consecutive silent observations (one alone is normal)
    let retryIndex = -1; // a sentence the engine keeps choking on
    let retries = 0;

    const stalled = (): boolean => {
      if (busyRef.current) return false; // generating audio, not stalled
      if (sentencesRef.current.length === 0) return false; // waiting for page text

      if (engineRef.current === 'webspeech') {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
        const synth = window.speechSynthesis;
        if (synth.paused) {
          synth.resume(); // some engines come back from a lock still paused
          return false;
        }
        if (synth.speaking || synth.pending) {
          // Claims to be speaking but may be silently wedged — only provable
          // on devices that emit boundary events.
          return sawBoundaryRef.current && Date.now() - lastProgressRef.current > 12_000;
        }
        return true;
      }

      const audio = audioRef.current;
      return !audio || audio.paused;
    };

    const check = () => {
      // While hidden the engine is legitimately suspended; don't fight it.
      if (document.visibilityState !== 'visible') {
        quiet = 0;
        return;
      }
      if (statusRef.current !== 'playing') return;
      if (!stalled()) {
        quiet = 0;
        return;
      }
      if (++quiet < 2) return;
      quiet = 0;
      const idx = indexRef.current;
      if (idx !== retryIndex) {
        retryIndex = idx;
        retries = 0;
      }
      // Two failed restarts means the sentence itself is the problem — skip it
      // rather than loop on it.
      play(retries++ >= 2 ? idx + 1 : idx);
    };

    const interval = setInterval(check, 3000);
    // On unlock, don't wait a whole poll cycle: bank one quiet observation so a
    // single confirming check resumes playback within half a second.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      quiet = 1;
      setTimeout(check, 500);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [status, play]);

  // ── Media Session ───────────────────────────────────────────────────────────
  // Lock-screen / notification controls, and a hint to the OS that this tab is
  // a media source rather than an idle page. Only the audio engine drives a
  // real media element, so this is what the phone shows while listening.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
    if (status === 'stopped') return;
    try {
      ms.metadata = new MediaMetadata({ title: mediaTitle || 'Lexis', artist: mediaArtist || '' });
    } catch {
      // MediaMetadata missing on older browsers — controls still work
    }
  }, [status, mediaTitle, mediaArtist]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => play()],
      ['pause', () => pause()],
      ['stop', () => stop()],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action — ignore
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Unsupported action — ignore
        }
      }
    };
  }, [play, pause, stop]);

  // Page (sentences) changed: reset, and auto-continue if we were playing.
  const prevSentencesRef = useRef(sentences);
  useEffect(() => {
    if (prevSentencesRef.current === sentences) return;
    prevSentencesRef.current = sentences;
    sentencesRef.current = sentences;
    const wasPlaying = statusRef.current === 'playing';
    ++sessionRef.current;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    audioRef.current?.pause();
    clearAudioCache();
    indexRef.current = 0;
    setActiveIndex(null);
    setBusy(false);
    // A pending resume fraction (set when switching between the text and its
    // translation) maps the old position onto the new sentence list.
    const resumeIndex = (): number => {
      const fraction = resumeFractionRef.current;
      resumeFractionRef.current = null;
      if (fraction === null) return 0;
      return Math.min(sentences.length - 1, Math.max(0, Math.round(fraction * sentences.length)));
    };

    if (wasPlaying && sentences.length > 0) {
      play(resumeIndex());
    } else if (wasPlaying) {
      // The new page has no readable text *yet* (e.g. its translation is
      // still being fetched). Hold the playing state — this effect fires
      // again with the real sentences and playback resumes; a fetch failure
      // or the user stopping ends the wait.
      setBusy(true);
    } else {
      // Not playing: still honour a pending resume position, so switching view
      // while paused and pressing play continues from roughly the same place.
      if (sentences.length > 0) indexRef.current = resumeIndex();
      setStatusBoth('stopped');
    }
  }, [sentences, play, clearAudioCache]);

  // Rate change mid-playback
  useEffect(() => {
    rateRef.current = rate;
    if (statusRef.current !== 'playing') return;
    if (engineRef.current === 'kokoro') {
      if (audioRef.current) audioRef.current.playbackRate = rate;
    } else {
      play(indexRef.current); // restart current sentence at the new rate
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  // Voice or content-language change: regenerate / restart the current sentence
  useEffect(() => {
    if (engineRef.current === 'kokoro') clearAudioCache();
    if (statusRef.current === 'playing') play(indexRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webVoiceURI, kokoroVoice, lang]);

  // Engine change: keep position, restart with the new engine if playing
  useEffect(() => {
    engineRef.current = engine;
    if (statusRef.current === 'playing') {
      play(indexRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Explicit preload so the panel can start the download when the user opts in
  const preloadKokoro = useCallback(() => {
    ensureKokoro().catch(() => {});
  }, [ensureKokoro]);

  // Teardown: never keep speaking after the reader unmounts
  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      ++sessionRef.current;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      audioRef.current?.pause();
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
      }
    };
  }, []);

  return {
    status,
    busy,
    activeIndex,
    voices,
    kokoroLoad,
    kokoroBackend,
    supported,
    play,
    pause,
    stop,
    seek,
    setResumeFraction,
    preloadKokoro,
  };
}
