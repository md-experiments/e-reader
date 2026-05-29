'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { extractPdfPages, getPdfTitle } from '@/lib/pdfExtract';
import { createBook, updateBook, uploadPdf, uploadExtractedText } from '@/lib/firestore';

const COVER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
];

export default function UploadFlow() {
  const { user } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<'idle' | 'extracting' | 'uploading' | 'saving' | 'done'>('idle');
  const [extractProgress, setExtractProgress] = useState({ page: 0, total: 0 });
  const [error, setError] = useState('');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setError('');

    try {
      const coverColor = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
      const title = getPdfTitle(file);

      // Extract text pages
      setStage('extracting');
      const extracted = await extractPdfPages(file, (page, total) =>
        setExtractProgress({ page, total }),
      );

      // Create book record in Firestore
      setStage('uploading');
      const book = await createBook(user.uid, {
        title,
        filename: file.name,
        pageCount: extracted.pageCount,
        storagePath: '',
        textStoragePath: '',
        coverColor,
      });

      // Upload PDF and extracted text to Firebase Storage in parallel
      const [storagePath, textStoragePath] = await Promise.all([
        uploadPdf(user.uid, book.id, file),
        uploadExtractedText(user.uid, book.id, JSON.stringify(extracted)),
      ]);

      // Save storage paths back to Firestore
      setStage('saving');
      await updateBook(user.uid, book.id, { storagePath, textStoragePath });

      setStage('done');
      router.push(`/reader/${book.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStage('idle');
    }
  };

  const isProcessing = stage !== 'idle' && stage !== 'done';

  return (
    <div className="max-w-lg mx-auto">
      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors select-none ${
          isProcessing ? 'pointer-events-none opacity-60 border-gray-200 bg-gray-50' :
          dragOver ? 'border-amber-400 bg-amber-50 cursor-copy' :
          'border-gray-200 hover:border-gray-300 bg-gray-50 cursor-pointer'
        }`}
      >
        <div className="text-4xl mb-4">{file ? '📄' : '📂'}</div>
        {file ? (
          <p className="text-sm font-medium text-gray-700">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Drop a PDF here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {isProcessing && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
            <span className="text-sm text-gray-600">
              {stage === 'extracting'
                ? `Extracting text… page ${extractProgress.page} of ${extractProgress.total}`
                : stage === 'uploading'
                ? 'Uploading to library…'
                : 'Saving…'}
            </span>
          </div>
          {stage === 'extracting' && extractProgress.total > 0 && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${(extractProgress.page / extractProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
      )}

      {file && !isProcessing && (
        <button
          onClick={handleUpload}
          className="mt-6 w-full py-3 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 transition-colors font-medium"
        >
          Add to library
        </button>
      )}
    </div>
  );
}
