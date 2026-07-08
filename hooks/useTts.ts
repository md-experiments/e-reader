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

let kokoroInstance: KokoroModelLike | null = null;
let kokoroPromise: Promise<KokoroModelLike> | null = null;

export function isKokoroReady(): boolean {
  return kokoroInstance !== null;
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
      const perFile = new Map<string, { loaded: number; total: number }>();
      const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
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
      kokoroInstance = tts as unknown as KokoroModelLike;
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
}

export function useTts({ sentences, engine, rate, webVoiceURI, kokoroVoice, lang, onPageComplete }: UseTtsArgs) {
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

  const sentencesRef = useRef(sentences);
  const engineRef = useRef(engine);
  const rateRef = useRef(rate);
  const webVoiceRef = useRef(webVoiceURI);
  const kokoroVoiceRef = useRef(kokoroVoice);
  const langRef = useRef(lang);
  const voicesRef = useRef(voices);
  const onPageCompleteRef = useRef(onPageComplete);
  useEffect(() => {
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
            await audio.play();
            // Prefetch the next sentence while this one plays
            if (idx + 1 < sentencesRef.current.length) getKokoroAudio(idx + 1).catch(() => {});
          } catch {
            if (session !== sessionRef.current) return;
            setBusy(false);
            setActiveIndex(null);
            setStatusBoth('stopped');
          }
        })();
      }
    },
    [finishPage, getKokoroAudio, getAudioEl],
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
    if (wasPlaying && sentences.length > 0) {
      play(0);
    } else {
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
    };
  }, []);

  return {
    status,
    busy,
    activeIndex,
    voices,
    kokoroLoad,
    supported,
    play,
    pause,
    stop,
    preloadKokoro,
  };
}
