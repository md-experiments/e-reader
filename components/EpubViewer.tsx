'use client';

import { useEffect, useRef, useState } from 'react';
import { getBytes } from 'firebase/storage';
import { ref } from 'firebase/storage';
import { getFirebaseStorage } from '@/lib/firebase';
import { parseContainer, parseOpf, resolvePath } from '@/lib/epubExtract';

interface Props {
  storagePath: string;
  currentPage: number;
  bgColor: string;
  borderColor: string;
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  css: 'text/css',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rewriteAssets(html: string, zip: any, chapterPath: string, blobStore: string[]): Promise<string> {
  const chapterDir = chapterPath.lastIndexOf('/') >= 0
    ? chapterPath.slice(0, chapterPath.lastIndexOf('/'))
    : '';

  const doc = new DOMParser().parseFromString(html, 'text/html');

  const attrs: Array<[string, string]> = [
    ['img', 'src'],
    ['image', 'href'],
    ['image', 'xlink:href'],
    ['link[rel="stylesheet"]', 'href'],
    ['source', 'src'],
  ];

  for (const [selector, attr] of attrs) {
    const elements = doc.querySelectorAll(selector);
    for (const el of Array.from(elements)) {
      const val = el.getAttribute(attr);
      if (!val || val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('http')) continue;

      const [rawPath] = val.split('#');
      const resolved = resolvePath(chapterDir, rawPath);
      const zipFile = zip.file(resolved);
      if (!zipFile) continue;

      try {
        const bytes = await zipFile.async('arraybuffer');
        const blob = new Blob([bytes], { type: getMimeType(resolved) });
        const blobUrl = URL.createObjectURL(blob);
        blobStore.push(blobUrl);
        el.setAttribute(attr, blobUrl);
      } catch {
        // skip unreadable assets
      }
    }
  }

  // Inject basic CSS for readable rendering
  const style = doc.createElement('style');
  style.textContent = `
    body { margin: 1.5rem 2rem; font-family: serif; line-height: 1.75; font-size: 1rem; }
    img { max-width: 100%; height: auto; }
    pre, code { white-space: pre-wrap; word-break: break-all; }
  `;
  (doc.head ?? doc.documentElement).appendChild(style);

  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

export default function EpubViewer({ storagePath, currentPage, bgColor, borderColor }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [zip, setZip] = useState<any>(null);
  const [spine, setSpine] = useState<string[]>([]);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [docError, setDocError] = useState(false);
  const [loading, setLoading] = useState(true);
  const blobUrls = useRef<string[]>([]);

  // Load EPUB zip once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDocError(false);
      setLoading(true);
      try {
        const JSZip = (await import('jszip')).default;
        const storage = getFirebaseStorage();
        const bytes = await getBytes(ref(storage, storagePath));
        const loadedZip = await JSZip.loadAsync(bytes);
        if (cancelled) return;

        const opfPath = await parseContainer(loadedZip);
        const { opfDir: dir, spine: spineItems } = await parseOpf(loadedZip, opfPath);
        if (cancelled) return;

        void dir;
        setZip(loadedZip);
        setSpine(spineItems);
      } catch {
        if (!cancelled) setDocError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storagePath]);

  // Render current chapter
  useEffect(() => {
    if (!zip || spine.length === 0) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      // Revoke previous blob URLs
      blobUrls.current.forEach(URL.revokeObjectURL);
      blobUrls.current = [];

      try {
        const chapterPath = spine[currentPage - 1];
        if (!chapterPath) return;

        const chapterFile = zip.file(chapterPath);
        const rawHtml = chapterFile ? await chapterFile.async('string') : '';
        if (cancelled) return;

        const processed = await rewriteAssets(rawHtml, zip, chapterPath, blobUrls.current);
        if (!cancelled) setSrcdoc(processed);
      } catch {
        // keep previous chapter visible on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [zip, spine, currentPage]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { blobUrls.current.forEach(URL.revokeObjectURL); };
  }, []);

  if (docError) {
    return (
      <div className="flex items-center justify-center py-20 text-sm opacity-50">
        Could not load EPUB
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{ backgroundColor: bgColor + 'cc', minHeight: '200px' }}
        >
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor }}
          />
        </div>
      )}
      {srcdoc && (
        <iframe
          srcDoc={srcdoc}
          sandbox="allow-same-origin"
          style={{ width: '100%', border: 'none', height: '80vh', display: 'block' }}
          title="Chapter preview"
        />
      )}
    </div>
  );
}
