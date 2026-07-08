'use client';

import type { TtsEngine, TtsStatus, KokoroLoadState, KokoroBackend } from '@/hooks/useTts';
import { KOKORO_VOICES } from '@/hooks/useTts';

interface ThemeLike {
  bg: string;
  fg: string;
  border: string;
  hover: string;
  track: string;
}

interface TtsPanelProps {
  t: ThemeLike;
  status: TtsStatus;
  busy: boolean;
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  kokoroLoad: KokoroLoadState;
  /** Backend Kokoro will use on this device (null while still detecting). */
  kokoroBackend: KokoroBackend | null;
  engine: TtsEngine;
  /** Language of the content being read when it isn't the book's own text
   *  (e.g. 'bg' while the Bulgarian translation is shown). */
  contentLang?: string;
  rate: number;
  webVoiceURI: string | null;
  kokoroVoice: string;
  onPlayPause: () => void;
  onStop: () => void;
  onEngineChange: (engine: TtsEngine) => void;
  onRateChange: (rate: number) => void;
  onWebVoiceChange: (voiceURI: string | null) => void;
  onKokoroVoiceChange: (voice: string) => void;
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export default function TtsPanel({
  t,
  status,
  busy,
  supported,
  voices,
  kokoroLoad,
  kokoroBackend,
  engine,
  contentLang,
  rate,
  webVoiceURI,
  kokoroVoice,
  onPlayPause,
  onStop,
  onEngineChange,
  onRateChange,
  onWebVoiceChange,
  onKokoroVoiceChange,
}: TtsPanelProps) {
  const selectStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    borderColor: t.border,
    color: t.fg,
  };

  // Voices for the language being read first (falling back to English), since
  // most system voice lists are long and unsorted
  const preferredLang = (contentLang ?? 'en').toLowerCase();
  const rank = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase();
    if (l.startsWith(preferredLang)) return 0;
    if (l.startsWith('en')) return 1;
    return 2;
  };
  const sortedVoices = [...voices].sort(
    (a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
  );

  return (
    <div
      className="sticky top-[49px] z-10 border-b px-4 py-3 flex flex-col gap-2"
      style={{ backgroundColor: t.bg, borderColor: t.border }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {/* Play / pause */}
        <button
          onClick={onPlayPause}
          disabled={engine === 'webspeech' && !supported}
          className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors disabled:opacity-25"
          style={{ borderColor: t.border, color: t.fg }}
          aria-label={status === 'playing' ? 'Pause' : 'Listen'}
        >
          {busy ? (
            <span
              className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: t.fg, borderTopColor: 'transparent' }}
            />
          ) : status === 'playing' ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" />
              <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3.5 1.8v10.4c0 .8.9 1.3 1.6.9l8-5.2c.6-.4.6-1.4 0-1.8l-8-5.2c-.7-.4-1.6.1-1.6.9z" />
            </svg>
          )}
        </button>

        {/* Stop */}
        <button
          onClick={onStop}
          disabled={status === 'stopped'}
          className="w-7 h-7 rounded-full border flex items-center justify-center transition-opacity disabled:opacity-25"
          style={{ borderColor: t.border, color: t.fg }}
          aria-label="Stop"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <rect x="1" y="1" width="8" height="8" rx="1.5" />
          </svg>
        </button>

        {/* Speed */}
        <select
          value={rate}
          onChange={(e) => onRateChange(Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded border outline-none"
          style={selectStyle}
          aria-label="Speed"
        >
          {RATES.map((r) => (
            <option key={r} value={r} style={{ backgroundColor: t.bg }}>
              {r}×
            </option>
          ))}
        </select>

        {/* Engine */}
        <select
          value={engine}
          onChange={(e) => onEngineChange(e.target.value as TtsEngine)}
          className="text-xs px-2 py-1.5 rounded border outline-none"
          style={selectStyle}
          aria-label="Voice engine"
        >
          <option value="webspeech" style={{ backgroundColor: t.bg }}>
            Device voice
          </option>
          <option value="kokoro" style={{ backgroundColor: t.bg }}>
            Enhanced
            {kokoroLoad.state === 'ready'
              ? ''
              : ` (~${kokoroBackend === 'webgpu' ? '350' : '120'} MB download)`}
          </option>
        </select>

        {/* Voice */}
        {engine === 'webspeech' ? (
          <select
            value={webVoiceURI ?? ''}
            onChange={(e) => onWebVoiceChange(e.target.value || null)}
            className="text-xs px-2 py-1.5 rounded border outline-none max-w-[180px]"
            style={selectStyle}
            aria-label="Voice"
          >
            <option value="" style={{ backgroundColor: t.bg }}>
              System default
            </option>
            {sortedVoices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI} style={{ backgroundColor: t.bg }}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        ) : (
          <select
            value={kokoroVoice}
            onChange={(e) => onKokoroVoiceChange(e.target.value)}
            className="text-xs px-2 py-1.5 rounded border outline-none max-w-[180px]"
            style={selectStyle}
            aria-label="Voice"
          >
            {KOKORO_VOICES.map((v) => (
              <option key={v.id} value={v.id} style={{ backgroundColor: t.bg }}>
                {v.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {engine === 'kokoro' && contentLang && (
        <p className="text-xs" style={{ color: t.fg, opacity: 0.6 }}>
          The enhanced voice is English-only, so the device voice is used while reading the
          translation.
        </p>
      )}

      {engine === 'webspeech' && !supported && (
        <p className="text-xs" style={{ color: t.fg, opacity: 0.6 }}>
          This browser doesn&apos;t support speech synthesis — switch to the Enhanced voice.
        </p>
      )}

      {engine === 'kokoro' && kokoroLoad.state === 'loading' && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: t.track }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${kokoroLoad.progress}%`, backgroundColor: '#d97706' }}
            />
          </div>
          <span className="text-xs tabular-nums" style={{ color: t.fg, opacity: 0.5 }}>
            {kokoroLoad.progress < 100 ? `Downloading voice… ${kokoroLoad.progress}%` : 'Preparing…'}
          </span>
        </div>
      )}

      {engine === 'kokoro' && kokoroLoad.state === 'idle' && (
        <p className="text-xs" style={{ color: t.fg, opacity: 0.5 }}>
          The enhanced voice runs entirely on your device
          {kokoroBackend === 'webgpu' ? ', accelerated by your GPU' : ''}. One-time download,
          cached for offline use.
        </p>
      )}

      {engine === 'kokoro' && kokoroLoad.state === 'error' && (
        <p className="text-xs" style={{ color: '#dc2626' }}>
          Couldn&apos;t load the enhanced voice ({kokoroLoad.error ?? 'unknown error'}). Check your
          connection and try again, or switch back to the device voice.
        </p>
      )}
    </div>
  );
}
