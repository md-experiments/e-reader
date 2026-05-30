import type { ExtractedBook, PageData, PageSegment, TocEntry } from '@/types';

// ── Path helpers ──────────────────────────────────────────────────────────────

export function resolvePath(baseDir: string, relativePath: string): string {
  const [path] = relativePath.split('#');
  const parts = (baseDir + '/' + path).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '' && part !== '.') resolved.push(part);
  }
  return resolved.join('/');
}

function dirname(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx) : '';
}

function basename(filePath: string): string {
  const [path] = filePath.split('#');
  return path.split('/').pop() ?? path;
}

// ── EPUB parsing ──────────────────────────────────────────────────────────────

interface ManifestItem {
  href: string;
  mediaType: string;
  properties?: string;
}

interface OpfData {
  opfDir: string;
  spine: string[];       // resolved paths from zip root
  spineHrefs: string[];  // raw hrefs as in OPF (for TOC mapping)
  dcTitle: string;
  tocHref: string | null;
  tocIsNav: boolean;
}

export async function parseContainer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zip: any,
): Promise<string> {
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const xml = await containerFile.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const rootfile = doc.querySelector('rootfile');
    const path = rootfile?.getAttribute('full-path');
    if (path) return path;
  }
  // Fallback: find first .opf file
  const opfFile = Object.keys(zip.files).find((f) => f.endsWith('.opf'));
  if (opfFile) return opfFile;
  throw new Error('No OPF file found in EPUB');
}

export async function parseOpf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zip: any,
  opfPath: string,
): Promise<OpfData> {
  const opfDir = dirname(opfPath);
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`OPF file not found: ${opfPath}`);

  const xml = await opfFile.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const version = doc.querySelector('package')?.getAttribute('version') ?? '2';
  const isEpub3 = version.startsWith('3');

  // Build manifest map
  const manifest = new Map<string, ManifestItem>();
  doc.querySelectorAll('manifest item').forEach((el) => {
    const id = el.getAttribute('id');
    const href = el.getAttribute('href');
    const mediaType = el.getAttribute('media-type') ?? '';
    const properties = el.getAttribute('properties') ?? undefined;
    if (id && href) manifest.set(id, { href, mediaType, properties });
  });

  // Build spine (raw hrefs)
  const spineHrefs: string[] = [];
  doc.querySelectorAll('spine itemref').forEach((el) => {
    const idref = el.getAttribute('idref');
    if (!idref) return;
    const item = manifest.get(idref);
    if (item) spineHrefs.push(item.href);
  });

  // Resolve spine to full paths from zip root
  const spine = spineHrefs.map((href) => resolvePath(opfDir, href));

  // Find TOC file
  let tocHref: string | null = null;
  let tocIsNav = false;

  if (isEpub3) {
    // EPUB 3: look for item with properties="nav"
    for (const [, item] of manifest) {
      if (item.properties?.split(/\s+/).includes('nav')) {
        tocHref = opfDir ? `${opfDir}/${item.href}` : item.href;
        tocIsNav = true;
        break;
      }
    }
  }

  if (!tocHref) {
    // EPUB 2: spine opf:toc attribute
    const spineEl = doc.querySelector('spine');
    const tocId =
      spineEl?.getAttribute('toc') ??
      spineEl?.getAttributeNS('http://www.idpf.org/2007/opf', 'toc');
    if (tocId) {
      const item = manifest.get(tocId);
      if (item) tocHref = opfDir ? `${opfDir}/${item.href}` : item.href;
    }
  }

  if (!tocHref) {
    // Fallback: find NCX by media type
    for (const [, item] of manifest) {
      if (item.mediaType === 'application/x-dtbncx+xml') {
        tocHref = opfDir ? `${opfDir}/${item.href}` : item.href;
        break;
      }
    }
  }

  const dcTitle =
    doc.querySelector('metadata > *|title, metadata title')?.textContent?.trim() ?? '';

  return { opfDir, spine, spineHrefs, dcTitle, tocHref, tocIsNav };
}

function buildSpineIndexMap(opfDir: string, spineHrefs: string[]): Map<string, number> {
  const map = new Map<string, number>();
  spineHrefs.forEach((href, i) => {
    const resolved = resolvePath(opfDir, href);
    map.set(resolved, i + 1);
    map.set(basename(href), i + 1);
    map.set(href, i + 1);
  });
  return map;
}

export async function parseTocNcx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zip: any,
  ncxPath: string,
  spineIndexMap: Map<string, number>,
  opfDir: string,
): Promise<TocEntry[]> {
  const file = zip.file(ncxPath);
  if (!file) return [];

  const xml = await file.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entries: TocEntry[] = [];
  const ncxDir = dirname(ncxPath);

  function processNavPoints(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navPoints: any[],
    level: number,
  ) {
    // Sort by playOrder if present
    const sorted = Array.from(navPoints).sort((a, b) => {
      const pa = parseInt(a.getAttribute('playOrder') ?? '0', 10);
      const pb = parseInt(b.getAttribute('playOrder') ?? '0', 10);
      return pa - pb;
    });

    for (const np of sorted) {
      const titleEl = np.querySelector(':scope > navLabel > text');
      const contentEl = np.querySelector(':scope > content');
      const title = titleEl?.textContent?.trim();
      const src = contentEl?.getAttribute('src') ?? '';

      if (title) {
        const resolved = resolvePath(ncxDir, src);
        const page =
          spineIndexMap.get(resolved) ??
          spineIndexMap.get(basename(src)) ??
          spineIndexMap.get(resolvePath(opfDir, basename(resolved))) ??
          1;
        entries.push({ title, page, level });
      }

      const children = Array.from(np.querySelectorAll(':scope > navPoint'));
      if (children.length) processNavPoints(children, level + 1);
    }
  }

  const topLevel = Array.from(doc.querySelectorAll('navMap > navPoint'));
  processNavPoints(topLevel, 0);
  return entries;
}

export async function parseTocNav(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zip: any,
  navPath: string,
  spineIndexMap: Map<string, number>,
  opfDir: string,
): Promise<TocEntry[]> {
  const file = zip.file(navPath);
  if (!file) return [];

  const html = await file.async('string');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const entries: TocEntry[] = [];
  const navDir = dirname(navPath);

  // Find the TOC nav element
  let navEl = doc.querySelector('nav[epub\\:type="toc"]');
  if (!navEl) navEl = doc.querySelector('nav');
  if (!navEl) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function processOl(ol: any, level: number) {
    for (const li of Array.from(ol.children) as Element[]) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const a = li.querySelector(':scope > a, :scope > span');
      const title = a?.textContent?.trim();
      if (title) {
        const href = a?.getAttribute('href') ?? '';
        const resolved = resolvePath(navDir, href);
        const page =
          spineIndexMap.get(resolved) ??
          spineIndexMap.get(basename(href)) ??
          spineIndexMap.get(resolvePath(opfDir, basename(resolved))) ??
          1;
        entries.push({ title, page, level });
      }
      const childOl = li.querySelector(':scope > ol');
      if (childOl) processOl(childOl, level + 1);
    }
  }

  const rootOl = navEl.querySelector('ol');
  if (rootOl) processOl(rootOl, 0);
  return entries;
}

// ── Text extraction ────────────────────────────────────────────────────────────

function extractChapterText(html: string): { segments: PageSegment[]; text: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove non-content elements
  doc.querySelectorAll('script, style, head').forEach((el) => el.remove());

  const blockEls = doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li');
  let segments: PageSegment[] = Array.from(blockEls)
    .map((el): PageSegment => {
      const tag = el.tagName.toLowerCase();
      let type: PageSegment['type'] = 'p';
      if (tag === 'h1') type = 'h1';
      else if (tag === 'h2') type = 'h2';
      else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') type = 'h3';
      return { type, text: el.textContent?.trim() ?? '' };
    })
    .filter((s) => s.text.length > 0);

  // Fallback: use body text as a single paragraph
  if (segments.length === 0) {
    const body = doc.body?.textContent?.trim();
    if (body) segments = [{ type: 'p', text: body }];
  }

  const text = segments.map((s) => s.text).join('\n\n');
  return { segments, text };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function extractEpubPages(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedBook> {
  const JSZip = (await import('jszip')).default;
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const opfPath = await parseContainer(zip);
  const { opfDir, spine, spineHrefs, dcTitle, tocHref, tocIsNav } = await parseOpf(zip, opfPath);
  const spineIndexMap = buildSpineIndexMap(opfDir, spineHrefs);

  let toc: TocEntry[] = [];
  if (tocHref) {
    try {
      toc = tocIsNav
        ? await parseTocNav(zip, tocHref, spineIndexMap, opfDir)
        : await parseTocNcx(zip, tocHref, spineIndexMap, opfDir);
    } catch {
      toc = [];
    }
  }

  const pageCount = spine.length;
  const pages: PageData[] = [];

  for (let i = 0; i < spine.length; i++) {
    try {
      const chapterFile = zip.file(spine[i]);
      const html = chapterFile ? await chapterFile.async('string') : '';
      const { segments, text } = extractChapterText(html);
      pages.push({ pageNumber: i + 1, text, segments });
    } catch {
      pages.push({ pageNumber: i + 1, text: '', segments: [] });
    }
    onProgress?.(i + 1, pageCount);
  }

  // Use OPF dc:title as an optional hint (returned via ExtractedBook title field)
  // We store it inside toc as a title hint via a side-channel field if needed,
  // but the caller can also get it via extractEpubTitle.
  void dcTitle;

  return { pageCount, pages, toc };
}

export async function extractEpubTitle(file: File): Promise<string> {
  try {
    const JSZip = (await import('jszip')).default;
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const opfPath = await parseContainer(zip);
    const { dcTitle } = await parseOpf(zip, opfPath);
    return dcTitle;
  } catch {
    return '';
  }
}

export function getEpubTitle(file: File): string {
  return file.name.replace(/\.epub$/i, '').replace(/[-_]/g, ' ');
}
