import type { Highlight, HighlightColor, PageSegment } from '@/types';

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

function buildHighlightedText(text: string, highlights: Highlight[]): string {
  const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
  let html = '';
  let pos = 0;

  for (const h of sorted) {
    const start = Math.max(h.startOffset, pos);
    const end = Math.min(h.endOffset, text.length);
    if (start >= end) continue;
    if (start > pos) html += escapeHtml(text.slice(pos, start));
    const color = HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.yellow;
    html += `<mark id="hl-${h.id}" style="background-color:${color};border-radius:2px;padding:0 1px">${escapeHtml(text.slice(start, end))}</mark>`;
    pos = end;
  }

  if (pos < text.length) html += escapeHtml(text.slice(pos));
  return html;
}

const SEG_STYLES: Record<PageSegment['type'], string> = {
  h1: 'font-size:1.55em;font-weight:700;line-height:1.3;margin:0.6em 0 0.35em',
  h2: 'font-size:1.25em;font-weight:700;line-height:1.4;margin:0.5em 0 0.3em',
  h3: 'font-size:1.1em;font-weight:600;line-height:1.5;margin:0.4em 0 0.25em',
  p:  'margin:0 0 0.75em',
};

// '\n\n' separator placed in an invisible, zero-height node so that
// Range.toString() counts its characters, keeping stored offsets accurate.
const INVISIBLE_SEP =
  '<div aria-hidden="true" style="height:0;overflow:hidden;font-size:0;line-height:0;user-select:none">\n\n</div>';

export function renderHighlights(
  text: string,
  highlights: Highlight[],
  segments?: PageSegment[],
): string {
  if (!segments || segments.length === 0) {
    // Legacy flat rendering for books uploaded before structured extraction
    return `<p style="white-space:pre-wrap">${buildHighlightedText(text, highlights)}</p>`;
  }

  const sorted = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
  let html = '';
  let globalOffset = 0;
  const SEP_LEN = 2; // '\n\n'

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segStart = globalOffset;
    const segEnd = segStart + seg.text.length;

    // Remap highlights to offsets local to this segment, clipped to its bounds
    const localHighlights: Highlight[] = sorted
      .filter((h) => h.endOffset > segStart && h.startOffset < segEnd)
      .map((h) => ({
        ...h,
        startOffset: Math.max(h.startOffset - segStart, 0),
        endOffset: Math.min(h.endOffset - segStart, seg.text.length),
      }));

    const tag = seg.type;
    html += `<${tag} style="${SEG_STYLES[tag]}">${buildHighlightedText(seg.text, localHighlights)}</${tag}>`;

    if (i < segments.length - 1) {
      html += INVISIBLE_SEP;
      globalOffset = segEnd + SEP_LEN;
    }
  }

  return html;
}
