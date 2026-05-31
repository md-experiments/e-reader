// Thumbnail generation — all functions are client-side only (called from UploadFlow).

const TARGET_WIDTH = 300;

/** Render PDF page 1 to a JPEG blob at TARGET_WIDTH pixels wide. */
export async function generatePdfThumbnail(file: File): Promise<Blob | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / base.width;
    const vp = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
  } catch {
    return null;
  }
}

/** Resize an image Blob to TARGET_WIDTH via canvas and return as JPEG. */
async function resizeBlob(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, TARGET_WIDTH / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Extract the cover image from an EPUB file and return it as a JPEG blob. */
export async function extractEpubCoverBlob(file: File): Promise<Blob | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    // Locate OPF
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) return null;
    const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) return null;

    const opfContent = await zip.file(opfPath)?.async('string');
    if (!opfContent) return null;
    const opfDoc = new DOMParser().parseFromString(opfContent, 'application/xml');

    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

    const resolvePath = (href: string) => {
      const parts = (opfDir ? opfDir + '/' + href : href).split('/');
      const out: string[] = [];
      for (const p of parts) {
        if (p === '..') out.pop();
        else if (p && p !== '.') out.push(p);
      }
      return out.join('/');
    };

    let coverHref: string | null = null;
    let mediaType = 'image/jpeg';

    // EPUB 3: <item properties="cover-image">
    const ep3 = opfDoc.querySelector('item[properties~="cover-image"]');
    if (ep3) {
      coverHref = ep3.getAttribute('href');
      mediaType = ep3.getAttribute('media-type') ?? mediaType;
    }

    // EPUB 2: <meta name="cover" content="item-id">
    if (!coverHref) {
      const metaCoverId = opfDoc.querySelector('meta[name="cover"]')?.getAttribute('content');
      if (metaCoverId) {
        const item = opfDoc.querySelector(`item[id="${metaCoverId}"]`);
        if (item) {
          coverHref = item.getAttribute('href');
          mediaType = item.getAttribute('media-type') ?? mediaType;
        }
      }
    }

    // Fallback: first image manifest item whose id or href contains "cover"
    if (!coverHref) {
      for (const item of Array.from(opfDoc.querySelectorAll('item'))) {
        const mt = item.getAttribute('media-type') ?? '';
        if (!mt.startsWith('image/')) continue;
        const id = (item.getAttribute('id') ?? '').toLowerCase();
        const href = (item.getAttribute('href') ?? '').toLowerCase();
        if (id.includes('cover') || href.includes('cover')) {
          coverHref = item.getAttribute('href');
          mediaType = item.getAttribute('media-type') ?? mediaType;
          break;
        }
      }
    }

    if (!coverHref) return null;

    const imageData = await zip.file(resolvePath(coverHref))?.async('arraybuffer');
    if (!imageData) return null;

    const raw = new Blob([imageData], { type: mediaType });
    return resizeBlob(raw);
  } catch {
    return null;
  }
}
