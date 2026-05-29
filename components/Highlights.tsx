import type { Highlight, HighlightColor } from '@/types';

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  blue: '#bfdbfe',
  pink: '#fbcfe8',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderHighlights(text: string, highlights: Highlight[]): string {
  const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
  let html = '';
  let pos = 0;

  for (const h of sorted) {
    const start = Math.max(h.startOffset, pos);
    const end = Math.min(h.endOffset, text.length);
    if (start >= end) continue;

    if (start > pos) html += escapeHtml(text.slice(pos, start));
    const color = HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.yellow;
    html += `<mark style="background-color:${color};border-radius:2px;padding:0 1px">${escapeHtml(text.slice(start, end))}</mark>`;
    pos = end;
  }

  if (pos < text.length) html += escapeHtml(text.slice(pos));

  return `<p style="white-space:pre-wrap">${html}</p>`;
}
