'use client';

import { useState, useRef, useEffect } from 'react';
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
  onDelete: (highlight: Highlight) => void;
  onUpdateNote: (highlight: Highlight, note: string) => void;
  onClose: () => void;
  t: ThemeConfig;
}

function NoteEditor({
  initial,
  onSave,
  onCancel,
  t,
}: {
  initial: string;
  onSave: (note: string) => void;
  onCancel: () => void;
  t: ThemeConfig;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const len = value.length;
    ref.current?.setSelectionRange(len, len);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Write a note…"
        className="w-full px-2.5 py-2 text-xs rounded-lg border outline-none resize-none focus:ring-1 focus:ring-amber-400"
        style={{ backgroundColor: 'transparent', borderColor: t.border, color: t.fg }}
      />
      <div className="flex gap-1.5">
        <button
          onClick={() => onSave(value.trim())}
          className="flex-1 py-1 text-xs rounded-lg font-medium"
          style={{ backgroundColor: '#d97706', color: '#fff' }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-1 text-xs rounded-lg border"
          style={{ borderColor: t.border, color: t.fg }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function HighlightsPanel({
  highlights,
  loading,
  onNavigate,
  onDelete,
  onUpdateNote,
  onClose,
  t,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

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
                <div
                  key={h.id}
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: t.border }}
                >
                  {/* Top row — navigates to page */}
                  <button
                    onClick={() => { if (editingId !== h.id) onNavigate(h); }}
                    className="w-full text-left p-3 transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hover)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: HIGHLIGHT_COLORS[h.color as HighlightColor] ?? HIGHLIGHT_COLORS.yellow }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed line-clamp-3" style={{ color: t.fg }}>
                          {h.text}
                        </p>
                        <p className="text-xs mt-1 opacity-35 tabular-nums" style={{ color: t.fg }}>
                          Page {h.pageNumber} · line ~{Math.floor(h.startOffset / 65) + 1}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Note + delete row */}
                  <div
                    className="px-3 pb-3 border-t pt-2"
                    style={{ borderColor: t.border }}
                  >
                    {editingId === h.id ? (
                      <NoteEditor
                        initial={h.note ?? ''}
                        onSave={(note) => {
                          onUpdateNote(h, note);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                        t={t}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingId(h.id)}
                          className="flex-1 text-left text-xs rounded-lg px-2 py-1.5 border border-dashed transition-opacity"
                          style={{
                            borderColor: t.border,
                            color: t.fg,
                            opacity: h.note ? 0.75 : 0.35,
                          }}
                        >
                          {h.note ? h.note : '+ Add note'}
                        </button>
                        <button
                          onClick={() => onDelete(h)}
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-opacity opacity-25 hover:opacity-80"
                          style={{ color: '#ef4444' }}
                          title="Delete highlight"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
