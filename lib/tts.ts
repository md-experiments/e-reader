// Text-to-speech utilities: sentence splitting with character offsets into the
// flat page text, and current-sentence highlighting via the CSS Custom
// Highlight API (no DOM mutation, so the memoised page content is untouched).

export interface Sentence {
  text: string;
  start: number; // character offset into the flat PageData.text
  end: number;
}

// Kokoro (and some system voices) degrade on very long inputs, so overly long
// sentences are split at clause boundaries.
const MAX_SENTENCE_LEN = 280;

/**
 * Split flat page text into sentences with global character offsets.
 * Paragraph boundaries ('\n\n', matching the segment join) are never crossed,
 * so offsets stay consistent with the highlight offset system.
 */
export function splitIntoSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let paraStart = 0;
  while (paraStart <= text.length) {
    let sep = text.indexOf('\n\n', paraStart);
    if (sep === -1) sep = text.length;
    splitParagraph(text.slice(paraStart, sep), paraStart, out);
    paraStart = sep + 2;
  }
  return out;
}

function splitParagraph(para: string, base: number, out: Sentence[]) {
  const push = (raw: string, rawStart: number) => {
    const trimmed = raw.trim();
    if (!trimmed || !/[\p{L}\p{N}]/u.test(trimmed)) return;
    const lead = raw.length - raw.trimStart().length;
    chunkLong(trimmed, base + rawStart + lead, out);
  };

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    for (const item of segmenter.segment(para)) push(item.segment, item.index);
  } else {
    const re = /[^.!?]+(?:[.!?]+["'")\]]*|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(para)) !== null) {
      if (m[0].length === 0) break;
      push(m[0], m.index);
    }
  }
}

function chunkLong(text: string, start: number, out: Sentence[]) {
  let rest = text;
  let off = start;
  while (rest.length > MAX_SENTENCE_LEN) {
    let cut = Math.max(
      rest.lastIndexOf(', ', MAX_SENTENCE_LEN),
      rest.lastIndexOf('; ', MAX_SENTENCE_LEN),
    );
    if (cut < MAX_SENTENCE_LEN * 0.3) cut = rest.lastIndexOf(' ', MAX_SENTENCE_LEN);
    cut = cut <= 0 ? MAX_SENTENCE_LEN : cut + 1; // keep the punctuation with the chunk
    const piece = rest.slice(0, cut).trimEnd();
    if (piece) out.push({ text: piece, start: off, end: off + piece.length });
    let next = cut;
    while (next < rest.length && rest[next] === ' ') next++;
    off += next;
    rest = rest.slice(next);
  }
  if (rest) out.push({ text: rest, start: off, end: off + rest.length });
}

// ── Current-sentence highlight (CSS Custom Highlight API) ────────────────────

const TTS_HIGHLIGHT_NAME = 'lexis-tts';

function highlightSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof window.Highlight !== 'undefined'
  );
}

/**
 * Build a DOM Range over the rendered page content from character offsets into
 * the flat text. Relies on the invisible '\n\n' separator nodes that
 * renderHighlights injects, which keep DOM text offsets aligned with the flat
 * string (same mechanism the highlight system uses).
 */
function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
  if (end <= start) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let lastNode: Text | null = null;

  let node = walker.nextNode() as Text | null;
  while (node) {
    const next = pos + node.data.length;
    if (!startNode && start < next) {
      startNode = node;
      startOffset = start - pos;
    }
    if (end <= next) {
      endNode = node;
      endOffset = end - pos;
      break;
    }
    lastNode = node;
    pos = next;
    node = walker.nextNode() as Text | null;
  }

  if (!startNode) return null;
  if (!endNode) {
    if (!lastNode) return null;
    endNode = lastNode;
    endOffset = lastNode.data.length;
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

/** Highlight [start, end) inside root; returns the Range (for scrolling) or null. */
export function applyTtsHighlight(root: HTMLElement, start: number, end: number): Range | null {
  if (!highlightSupported()) return null;
  const range = rangeFromOffsets(root, start, end);
  if (!range) {
    CSS.highlights.delete(TTS_HIGHLIGHT_NAME);
    return null;
  }
  CSS.highlights.set(TTS_HIGHLIGHT_NAME, new window.Highlight(range));
  return range;
}

export function clearTtsHighlight() {
  if (!highlightSupported()) return;
  CSS.highlights.delete(TTS_HIGHLIGHT_NAME);
}

/** Scroll the container so the spoken sentence stays comfortably in view. */
export function scrollRangeIntoView(container: HTMLElement | null, range: Range) {
  if (!container) return;
  const rect = range.getBoundingClientRect();
  const crect = container.getBoundingClientRect();
  if (rect.top < crect.top + 24 || rect.bottom > crect.bottom - 96) {
    container.scrollTo({
      top: container.scrollTop + rect.top - crect.top - crect.height * 0.3,
      behavior: 'smooth',
    });
  }
}
