'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { extractPdfPages, getPdfTitle } from '@/lib/pdfExtract';
import { extractEpubPages, extractEpubTitle, getEpubTitle } from '@/lib/epubExtract';
import { createBook, updateBook, uploadPdf, uploadEpub, uploadExtractedText, uploadThumbnail, getBooks } from '@/lib/firestore';
import { generatePdfThumbnail, extractEpubCoverBlob } from '@/lib/thumbnail';
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
  const [fileType, setFileType] = useState<'pdf' | 'epub'>('pdf');
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
    const isEpub = dropped?.name.toLowerCase().endsWith('.epub');
    if (dropped?.type === 'application/pdf' || isEpub) selectFile(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) selectFile(selected);
  };

  const selectFile = (f: File) => {
    const isEpub = f.name.toLowerCase().endsWith('.epub');
    setFile(f);
    setFileType(isEpub ? 'epub' : 'pdf');
    setTitle(isEpub ? getEpubTitle(f) : getPdfTitle(f));
    setTags([]);
    // Try to pull a better title from the OPF metadata asynchronously
    if (isEpub) {
      extractEpubTitle(f).then((t) => { if (t) setTitle(t); });
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setError('');

    try {
      const coverColor = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];

      setStage('extracting');
      const extracted = fileType === 'epub'
        ? await extractEpubPages(file, (page, total) => setExtractProgress({ page, total }))
        : await extractPdfPages(file, (page, total) => setExtractProgress({ page, total }));

      // Start thumbnail generation in parallel with book creation (best-effort)
      const thumbnailPromise = fileType === 'epub'
        ? extractEpubCoverBlob(file)
        : generatePdfThumbnail(file);

      setStage('uploading');
      const book = await createBook(user.uid, {
        title: title.trim() || (fileType === 'epub' ? getEpubTitle(file) : getPdfTitle(file)),
        filename: file.name,
        pageCount: extracted.pageCount,
        storagePath: '',
        textStoragePath: '',
        coverColor,
        tags,
        toc: extracted.toc,
        fileType,
      });

      const [storagePath, textStoragePath, thumbnailBlob] = await Promise.all([
        fileType === 'epub'
          ? uploadEpub(user.uid, book.id, file)
          : uploadPdf(user.uid, book.id, file),
        uploadExtractedText(user.uid, book.id, JSON.stringify(extracted)),
        thumbnailPromise,
      ]);

      setStage('saving');
      const thumbnailUrl = thumbnailBlob
        ? await uploadThumbnail(user.uid, book.id, thumbnailBlob).catch(() => undefined)
        : undefined;
      await updateBook(user.uid, book.id, { storagePath, textStoragePath, ...(thumbnailUrl ? { thumbnailUrl } : {}) });

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
          isProcessing ? 'pointer-events-none opacity-60 border-lexis-border bg-lexis-panel' :
          dragOver ? 'border-lexis-accent bg-lexis-accent-bg cursor-copy' :
          'border-lexis-border hover:border-lexis-accent bg-lexis-panel cursor-pointer'
        }`}
      >
        <div className="text-3xl mb-3">{file ? (fileType === 'epub' ? '📖' : '📄') : '📂'}</div>
        {file ? (
          <p className="text-sm font-medium text-lexis-muted">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium">Drop a PDF or EPUB here</p>
            <p className="text-xs text-lexis-muted mt-1">or click to browse</p>
          </>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,application/epub+zip,.epub" className="hidden" onChange={handleFileChange} />
      </div>

      {/* Title + tags (shown after file is selected, before processing) */}
      {file && !isProcessing && (
        <>
          <div>
            <label className="block text-xs font-medium text-lexis-muted mb-1">Book title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-lexis-bg border border-lexis-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-lexis-accent focus:border-transparent"
              placeholder="Enter book title"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-lexis-muted mb-1">Tags <span className="font-normal opacity-70">(optional)</span></label>
            <TagInput value={tags} onChange={setTags} suggestions={existingTags} />
          </div>

          <button
            onClick={handleUpload}
            className="w-full py-3 bg-lexis-fg text-lexis-bg text-sm rounded-xl hover:opacity-80 transition-opacity font-medium"
          >
            Add to library
          </button>
        </>
      )}

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 border-lexis-accent border-t-transparent animate-spin shrink-0" />
            <span className="text-sm text-lexis-muted">
              {stage === 'extracting'
                ? `Extracting text… ${fileType === 'epub' ? 'chapter' : 'page'} ${extractProgress.page} of ${extractProgress.total}`
                : stage === 'uploading' ? 'Uploading to library…' : 'Saving…'}
            </span>
          </div>
          {stage === 'extracting' && extractProgress.total > 0 && (
            <div className="h-1.5 bg-lexis-track rounded-full overflow-hidden">
              <div
                className="h-full bg-lexis-accent rounded-full transition-all"
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
