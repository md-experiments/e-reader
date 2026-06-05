'use client';

import { HIGHLIGHT_COLORS } from '@/components/Highlights';
import type { Highlight, HighlightColor } from '@/types';

interface ThemeConfig {
  bg: string;
  fg: string;
  border: string;
  hover: string;
}

interface Props {
  highlights: Highlight[];
  loading: boolean;
  onNavigate: (highlight: Highlight) => void;
  onClose: () => void;
  t: ThemeConfig;
}

export default function HighlightsPanel({ highlights, loading, onNavigate, onClose, t }: Props) {
  const sorted = [...highlights].sort((a, b) =>
    a.pageNumber !== b.pageNumber ? a.pageNumber - b.pageNumber : a.startOffset - b.startOffset,
  );

  return (
    <>
      <div
        className="fixed inset-0 z-20"
        style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
        onClick={onClose}
      />
      <div
        className="fixed top-0 right-0 bottom-0 z-30 flex flex-col shadow-2xl"
        style={{ width: 'min(320px, 92vw)', backgroundColor: t.bg, borderLeft: `1px solid ${t.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
          style={{ borderColor: t.border }}
        >
          <span className="text-sm font-semibold" style={{ color: t.fg }}>Highlights</span>
          <button
            onClick={onClose}
            className="opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: t.fg, fontSize: '1.1rem', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div
                className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: t.fg, opacity: 0.3 }}
              />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-2 text-center px-6">
              <span className="text-2xl opacity-20">✦</span>
              <span className="text-sm opacity-40" style={{ color: t.fg }}>No highlights yet</span>
              <span className="text-xs opacity-30" style={{ color: t.fg }}>
                Select text while reading to add one
              </span>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {sorted.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onNavigate(h)}
                  className="w-full text-left rounded-xl p-3 border transition-colors"
                  style={{ borderColor: t.border }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                      style={{ backgroundColor: HIGHLIGHT_COLORS[h.color as HighlightColor] ?? HIGHLIGHT_COLORS.yellow }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm leading-relaxed line-clamp-3"
                        style={{ color: t.fg }}
                      >
                        {h.text}
                      </p>
                      <p className="text-xs mt-1.5 opacity-35 tabular-nums" style={{ color: t.fg }}>
                        Page {h.pageNumber}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
