import type { ExtractedBook, PageData, PageSegment, TocEntry } from '@/types';

interface RawLine {
  y: number;
  fontSize: number;
  text: string;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildPageStructure(items: unknown[]): { segments: PageSegment[]; text: string } {
  // Filter to real text items (not TextMarkedContent)
  const textItems = items.filter(
    (item): item is { str: string; transform: number[]; height: number } =>
      typeof item === 'object' &&
      item !== null &&
      'str' in item &&
      typeof (item as Record<string, unknown>).str === 'string' &&
      ((item as Record<string, unknown>).str as string).trim().length > 0,
  );

  if (textItems.length === 0) return { segments: [], text: '' };

  // Group items into lines by Y position (tolerance 3 pts handles slight baseline variance)
  const lines: RawLine[] = [];
  let currentY = textItems[0].transform[5];
  let currentParts: string[] = [];
  let currentFontSize = textItems[0].height;

  const flush = () => {
    if (currentParts.length === 0) return;
    const text = currentParts.join(' ').replace(/\s+/g, ' ').trim();
    if (text) lines.push({ y: currentY, fontSize: currentFontSize, text });
    currentParts = [];
  };

  for (const item of textItems) {
    const y = item.transform[5];
    if (Math.abs(y - currentY) > 3) {
      flush();
      currentY = y;
      currentFontSize = item.height;
    }
    currentParts.push(item.str);
    if (item.height > currentFontSize) currentFontSize = item.height;
  }
  flush();

  if (lines.length === 0) return { segments: [], text: '' };

  // Compute typography statistics
  const fontSizes = lines.map((l) => l.fontSize).filter((s) => s > 0);
  const medianFontSize = median(fontSizes) || 12;

  const yGaps = lines
    .slice(1)
    .map((l, i) => Math.abs(lines[i].y - l.y))
    .filter((g) => g > 0);
  const medianGap = median(yGaps) || 14;
  const paragraphThreshold = medianGap * 1.5;

  // Group lines into paragraphs by detecting large Y-gaps
  const paragraphs: { lines: RawLine[]; maxFontSize: number }[] = [];
  let paraLines: RawLine[] = [];
  let paraMaxFont = 0;

  const flushPara = () => {
    if (paraLines.length === 0) return;
    paragraphs.push({ lines: paraLines, maxFontSize: paraMaxFont });
    paraLines = [];
    paraMaxFont = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const gap = i > 0 ? Math.abs(lines[i - 1].y - lines[i].y) : 0;
    if (i > 0 && gap > paragraphThreshold) flushPara();
    paraLines.push(lines[i]);
    if (lines[i].fontSize > paraMaxFont) paraMaxFont = lines[i].fontSize;
  }
  flushPara();

  // Classify each paragraph as heading or body text
  const segments: PageSegment[] = paragraphs.map((para) => {
    const text = para.lines.map((l) => l.text).join(' ').trim();
    const ratio = medianFontSize > 0 ? para.maxFontSize / medianFontSize : 1;
    let type: PageSegment['type'] = 'p';
    if (ratio >= 1.6) type = 'h1';
    else if (ratio >= 1.3) type = 'h2';
    else if (ratio >= 1.15) type = 'h3';
    return { type, text };
  }).filter((s) => s.text.length > 0);

  const text = segments.map((s) => s.text).join('\n\n');
  return { segments, text };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractTocFromPdf(pdf: any): Promise<TocEntry[]> {
  try {
    const outline = await pdf.getOutline();
    if (!outline || outline.length === 0) return [];

    const entries: TocEntry[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function flatten(items: any[], level: number): Promise<void> {
      for (const item of items) {
        let page = 1;
        try {
          if (item.dest) {
            const dest =
              typeof item.dest === 'string'
                ? await pdf.getDestination(item.dest)
                : item.dest;
            if (dest?.[0] != null) {
              const idx = await pdf.getPageIndex(dest[0]);
              page = idx + 1;
            }
          }
        } catch {
          // Unresolvable destination — default to page 1
        }
        if (item.title?.trim()) {
          entries.push({ title: item.title.trim(), page, level });
        }
        if (item.items?.length) {
          await flatten(item.items, level + 1);
        }
      }
    }

    await flatten(outline, 0);
    return entries;
  } catch {
    return [];
  }
}

export async function extractPdfPages(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedBook> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;
  const pages: PageData[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const { segments, text } = buildPageStructure(content.items);
    pages.push({ pageNumber: i, text, segments });
    onProgress?.(i, pageCount);
  }

  const toc = await extractTocFromPdf(pdf);
  return { pageCount, pages, toc };
}

export function getPdfTitle(file: File): string {
  return file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
}
