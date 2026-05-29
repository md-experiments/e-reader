import type { ExtractedBook, PageData } from '@/types';

export async function extractPdfPages(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedBook> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;
  const pages: PageData[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    pages.push({ pageNumber: i, text });
    onProgress?.(i, pageCount);
  }

  return { pageCount, pages };
}

export function getPdfTitle(file: File): string {
  return file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
}
