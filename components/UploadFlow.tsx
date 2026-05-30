'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { extractPdfPages, getPdfTitle } from '@/lib/pdfExtract';
import { createBook, updateBook, uploadPdf, uploadExtractedText, getBooks } from '@/lib/firestore';
import TagInput from '@/components/TagInput';

const COVER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
];

export default function UploadFlow() {
  const { user } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<'idle' | 'extracting' | 'uploading' | 'saving' | 'done'>('idle');
  const [extractProgress, setExtractProgress] = useState({ page: 0, total: 0 });
  const [error, setError] = useState('');

  // Load existing tags from library for autocomplete
  useEffect(() => {
    if (!user) return;
    getBooks(user.uid).then((books) => {
      const set = new Set<string>();
      books.forEach((b) => b.tags?.forEach((t) => set.add(t)));
      setExistingTags(Array.from(set).sort());
    });
  }, [user]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') selectFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) selectFile(selected);
  };

  const selectFile = (f: File) => {
    setFile(f);
    setTitle(getPdfTitle(f));
    setTags([]);
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setError('');

    try {
      const coverColor = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];

      setStage('extracting');
      const extracted = await extractPdfPages(file, (page, total) =>
        setExtractProgress({ page, total }),
      );

      setStage('uploading');
      const book = await createBook(user.uid, {
        title: title.trim() || getPdfTitle(file),
        filename: file.name,
        pageCount: extracted.pageCount,
        storagePath: '',
        textStoragePath: '',
        coverColor,
        tags,
        toc: extracted.toc,
      });

      const [storagePath, textStoragePath] = await Promise.all([
        uploadPdf(user.uid, book.id, file),
        uploadExtractedText(user.uid, book.id, JSON.stringify(extracted)),
      ]);

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
    <div className="max-w-lg mx-auto space-y-4">
      {/* Drop zone */}
      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors select-none ${
          isProcessing ? 'pointer-events-none opacity-60 border-gray-200 bg-gray-50' :
          dragOver ? 'border-amber-400 bg-amber-50 cursor-copy' :
          'border-gray-200 hover:border-gray-300 bg-gray-50 cursor-pointer'
        }`}
      >
        <div className="text-3xl mb-3">{file ? '📄' : '📂'}</div>
        {file ? (
          <p className="text-sm font-medium text-gray-600">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Drop a PDF here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          </>
        )}
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
      </div>

      {/* Title + tags (shown after file is selected, before processing) */}
      {file && !isProcessing && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Book title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
              placeholder="Enter book title"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tags <span className="font-normal text-gray-400">(optional)</span></label>
            <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
          </div>

          <button
            onClick={handleUpload}
            className="w-full py-3 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-700 transition-colors font-medium"
          >
            Add to library
          </button>
        </>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
            <span className="text-sm text-gray-600">
              {stage === 'extracting'
                ? `Extracting text… page ${extractProgress.page} of ${extractProgress.total}`
                : stage === 'uploading' ? 'Uploading to library…' : 'Saving…'}
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
        <p className="text-sm text-red-500 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
      )}
    </div>
  );
}
