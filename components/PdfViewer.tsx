'use client';

import { useEffect, useRef, useState } from 'react';
import { getStorageDownloadUrl } from '@/lib/firestore';

interface Props {
  storagePath: string;
  currentPage: number;
  bgColor: string;
  borderColor: string;
}

export default function PdfViewer({ storagePath, currentPage, bgColor, borderColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [docError, setDocError] = useState(false);
  const [rendering, setRendering] = useState(false);

  // Load the PDF document once when storagePath is available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const url = await getStorageDownloadUrl(storagePath);
        const doc = await pdfjsLib.getDocument({ url }).promise;
        if (!cancelled) setPdfDoc(doc);
      } catch {
        if (!cancelled) setDocError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [storagePath]);

  // Render the current page to canvas whenever pdfDoc or currentPage changes
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled || !canvasRef.current || !containerRef.current) return;

        const containerWidth = containerRef.current.clientWidth || 680;
        const dpr = window.devicePixelRatio || 1;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = (containerWidth / baseViewport.width) * dpr;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {
        // render error — ignore; previous page stays visible
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, currentPage]);

  if (docError) {
    return (
      <div className="flex items-center justify-center py-20 text-sm opacity-50">
        Could not load PDF
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {(!pdfDoc || rendering) && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{ backgroundColor: bgColor + 'cc' }}
        >
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor }}
          />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="block shadow-lg rounded"
        style={{ maxWidth: '100%' }}
      />
    </div>
  );
}
