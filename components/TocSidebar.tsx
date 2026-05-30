'use client';

import { useState } from 'react';
import type { TocEntry } from '@/types';

interface T {
  bg: string;
  fg: string;
  border: string;
  hover: string;
}

interface Props {
  toc: TocEntry[];
  currentPage: number;
  pageCount: number;
  onNavigate: (page: number) => void;
  onClose: () => void;
  onSave: (toc: TocEntry[]) => Promise<void>;
  t: T;
}

function activeIndex(toc: TocEntry[], currentPage: number): number {
  let idx = 0;
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].page <= currentPage) idx = i;
  }
  return toc.length > 0 ? idx : -1;
}

export default function TocSidebar({
  toc,
  currentPage,
  pageCount,
  onNavigate,
  onClose,
  onSave,
  t,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<TocEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const enterEdit = () => {
    setDraft(toc.map((e) => ({ ...e })));
    setEditMode(true);
  };

  const cancelEdit = () => setEditMode(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft.filter((e) => e.title.trim()));
    setSaving(false);
    setEditMode(false);
  };

  const update = (i: number, patch: Partial<TocEntry>) =>
    setDraft((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const remove = (i: number) => setDraft((prev) => prev.filter((_, idx) => idx !== i));

  const addEntry = () =>
    setDraft((prev) => [
      ...prev,
      { title: '', page: Math.min((prev[prev.length - 1]?.page ?? 0) + 1, pageCount), level: 0 },
    ]);

  const active = !editMode ? activeIndex(toc, currentPage) : -1;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20"
        style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-30 flex flex-col shadow-2xl"
        style={{
          width: 'min(300px, 88vw)',
          backgroundColor: t.bg,
          borderLeft: `1px solid ${t.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0 border-b"
          style={{ borderColor: t.border }}
        >
          <span className="text-sm font-semibold" style={{ color: t.fg }}>
            Contents
          </span>
          <div className="flex items-center gap-3">
            {!editMode && (
              <button
                onClick={enterEdit}
                className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: t.fg }}
              >
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: t.fg, fontSize: '1.1rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {editMode ? (
            /* ── Edit mode ─────────────────────────────────────────── */
            <div className="p-3 space-y-1.5">
              {draft.map((entry, i) => (
                <div key={i} className="flex items-center gap-1">
                  {/* Level indent controls */}
                  <button
                    onClick={() => update(i, { level: Math.max(0, entry.level - 1) })}
                    disabled={entry.level === 0}
                    title="Decrease indent"
                    className="w-5 h-6 text-xs shrink-0 flex items-center justify-center rounded disabled:opacity-20 transition-opacity"
                    style={{ color: t.fg }}
                  >
                    ←
                  </button>
                  <button
                    onClick={() => update(i, { level: Math.min(2, entry.level + 1) })}
                    disabled={entry.level >= 2}
                    title="Increase indent"
                    className="w-5 h-6 text-xs shrink-0 flex items-center justify-center rounded disabled:opacity-20 transition-opacity"
                    style={{ color: t.fg }}
                  >
                    →
                  </button>

                  {/* Visual indent spacer */}
                  <div style={{ width: entry.level * 8, flexShrink: 0 }} />

                  {/* Title */}
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    placeholder="Chapter title"
                    className="flex-1 min-w-0 px-2 py-1 text-xs rounded border outline-none focus:ring-1 focus:ring-amber-400"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: t.border,
                      color: t.fg,
                    }}
                  />

                  {/* Page number */}
                  <input
                    type="number"
                    value={entry.page}
                    min={1}
                    max={pageCount}
                    onChange={(e) =>
                      update(i, { page: Math.max(1, Math.min(pageCount, parseInt(e.target.value) || 1)) })
                    }
                    className="w-12 px-1 py-1 text-xs text-center rounded border outline-none focus:ring-1 focus:ring-amber-400"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: t.border,
                      color: t.fg,
                    }}
                  />

                  {/* Remove */}
                  <button
                    onClick={() => remove(i)}
                    className="w-5 h-6 shrink-0 flex items-center justify-center text-xs opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: '#ef4444' }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <button
                onClick={addEntry}
                className="w-full mt-2 py-1.5 text-xs rounded border border-dashed opacity-50 hover:opacity-80 transition-opacity"
                style={{ borderColor: t.border, color: t.fg }}
              >
                + Add entry
              </button>
            </div>
          ) : toc.length === 0 ? (
            /* ── Empty state ───────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center h-full py-12 gap-3 opacity-40">
              <span className="text-sm" style={{ color: t.fg }}>
                No table of contents
              </span>
              <button
                onClick={enterEdit}
                className="text-xs underline"
                style={{ color: t.fg }}
              >
                Add one manually
              </button>
            </div>
          ) : (
            /* ── View mode ─────────────────────────────────────────── */
            <nav className="py-1">
              {toc.map((entry, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={i}
                    onClick={() => { onNavigate(entry.page); onClose(); }}
                    className="w-full text-left flex items-baseline gap-2 transition-colors"
                    style={{
                      paddingTop: '0.45rem',
                      paddingBottom: '0.45rem',
                      paddingLeft: `${1 + entry.level * 0.9}rem`,
                      paddingRight: '1rem',
                      backgroundColor: isActive ? t.hover : 'transparent',
                      color: t.fg,
                      opacity: entry.level === 0 ? 1 : entry.level === 1 ? 0.75 : 0.55,
                      fontSize: entry.level === 0 ? '0.8rem' : '0.74rem',
                      fontWeight: isActive ? 600 : entry.level === 0 ? 500 : 400,
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 w-0.5 h-5 rounded-r"
                        style={{ backgroundColor: '#d97706' }}
                      />
                    )}
                    <span className="flex-1 leading-snug">{entry.title}</span>
                    <span className="shrink-0 text-xs opacity-35 tabular-nums">{entry.page}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Footer — save/cancel in edit mode */}
        {editMode && (
          <div
            className="shrink-0 px-3 py-3 border-t flex gap-2"
            style={{ borderColor: t.border }}
          >
            <button
              onClick={cancelEdit}
              className="flex-1 py-2 text-sm rounded-lg border transition-colors"
              style={{ borderColor: t.border, color: t.fg }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 text-sm rounded-lg disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#d97706', color: '#fff' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
