'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  getBook,
  getProgress,
  saveProgress,
  getHighlightsForPage,
  addHighlight,
  getStorageDownloadUrl,
} from '@/lib/firestore';
import { renderHighlights, HIGHLIGHT_COLORS } from '@/components/Highlights';
import type { Book, PageData, Highlight, HighlightColor, ExtractedBook } from '@/types';

type Theme = 'light' | 'dark' | 'sepia';

const THEMES: Record<Theme, { page: string; toolbar: string; text: string; border: string; btn: string }> = {
  light: {
    page: 'bg-white',
    toolbar: 'bg-white border-gray-100',
    text: 'text-gray-900',
    border: 'border-gray-100',
    btn: 'hover:bg-gray-100',
  },
  dark: {
    page: 'bg-gray-950',
    toolbar: 'bg-gray-950 border-gray-800',
    text: 'text-gray-100',
    border: 'border-gray-800',
    btn: 'hover:bg-gray-800',
  },
  sepia: {
    page: 'bg-amber-50',
    toolbar: 'bg-amber-50 border-amber-100',
    text: 'text-amber-900',
    border: 'border-amber-100',
    btn: 'hover:bg-amber-100',
  },
};

interface ColorPickerState {
  x: number;
  y: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export default function Reader({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<Theme>('light');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [bookData, progress] = await Promise.all([
        getBook(user.uid, bookId),
        getProgress(user.uid, bookId),
      ]);
      if (!bookData) return;
      setBook(bookData);
      if (progress) setCurrentPage(progress.currentPage);

      const url = await getStorageDownloadUrl(bookData.textStoragePath);
      const json: ExtractedBook = await fetch(url).then((r) => r.json());
      setPages(json.pages);
      setLoading(false);
    })();
  }, [user, bookId]);

  useEffect(() => {
    if (!user) return;
    getHighlightsForPage(user.uid, bookId, currentPage).then(setHighlights);
  }, [user, bookId, currentPage]);

  // Debounced progress save
  useEffect(() => {
    if (!user || !book || loading) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      saveProgress(user.uid, bookId, currentPage, book.pageCount);
    }, 2000);
    return () => { if (progressTimer.current) clearTimeout(progressTimer.current); };
  }, [user, bookId, currentPage, book, loading]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !contentRef.current) return;
    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2) return;

    const range = selection.getRangeAt(0);
    const container = contentRef.current;

    const preRange = document.createRange();
    preRange.setStart(container, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    const rect = range.getBoundingClientRect();
    setColorPicker({
      x: Math.min(rect.left + rect.width / 2, window.innerWidth - 160),
      y: rect.top + window.scrollY - 52,
      text: selectedText,
      startOffset,
      endOffset,
    });
  }, []);

  const saveHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!user || !colorPicker) return;
      const h = await addHighlight(user.uid, {
        bookId,
        text: colorPicker.text,
        pageNumber: currentPage,
        color,
        startOffset: colorPicker.startOffset,
        endOffset: colorPicker.endOffset,
      });
      setHighlights((prev) => [...prev, h]);
      setColorPicker(null);
      window.getSelection()?.removeAllRanges();
    },
    [user, colorPicker, bookId, currentPage],
  );

  const dismissColorPicker = useCallback(() => {
    setColorPicker(null);
    setShowSettings(false);
  }, []);

  const goToPrev = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), []);
  const goToNext = useCallback(
    () => setCurrentPage((p) => Math.min(book?.pageCount ?? p, p + 1)),
    [book],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goToPrev, goToNext]);

  if (loading) {
    const t = THEMES[theme];
    return (
      <div className={`min-h-screen flex items-center justify-center ${t.page}`}>
        <div className={`w-6 h-6 rounded-full border-2 border-t-transparent animate-spin ${theme === 'dark' ? 'border-gray-500' : 'border-gray-300'}`} />
      </div>
    );
  }

  const pageText = pages[currentPage - 1]?.text ?? '';
  const pct = Math.round((currentPage / (book?.pageCount ?? 1)) * 100);
  const t = THEMES[theme];

  return (
    <div className={`min-h-screen flex flex-col ${t.page} ${t.text}`} onClick={dismissColorPicker}>
      {/* Top toolbar */}
      <header className={`sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b ${t.toolbar} ${t.border}`}>
        <Link
          href="/library"
          className="text-sm opacity-50 hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          ← Library
        </Link>
        <span className="text-sm font-medium truncate max-w-[180px] sm:max-w-xs opacity-80">
          {book?.title}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowSettings((s) => !s); }}
          className={`text-sm px-2 py-1 rounded opacity-50 hover:opacity-100 transition-opacity ${t.btn}`}
        >
          Aa
        </button>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div
          className={`sticky top-[49px] z-10 border-b px-4 py-2.5 flex items-center gap-5 ${t.toolbar} ${t.border}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Font size */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFontSize((f) => Math.max(12, f - 2))}
              className={`w-7 h-7 rounded border text-xs flex items-center justify-center ${t.border} ${t.btn}`}
            >
              A−
            </button>
            <span className="text-xs w-6 text-center opacity-60">{fontSize}</span>
            <button
              onClick={() => setFontSize((f) => Math.min(32, f + 2))}
              className={`w-7 h-7 rounded border text-xs flex items-center justify-center ${t.border} ${t.btn}`}
            >
              A+
            </button>
          </div>
          {/* Theme swatches */}
          <div className="flex items-center gap-2">
            {(['light', 'dark', 'sepia'] as Theme[]).map((th) => (
              <button
                key={th}
                onClick={() => setTheme(th)}
                title={th}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${theme === th ? 'border-gray-500 scale-110' : 'border-transparent'}`}
                style={{
                  backgroundColor:
                    th === 'light' ? '#ffffff' : th === 'dark' ? '#030712' : '#fffbeb',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 overflow-y-auto px-5 py-10">
        <div className="max-w-[65ch] mx-auto">
          <div
            ref={contentRef}
            onMouseUp={handleMouseUp}
            className="font-serif select-text"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.9 }}
            dangerouslySetInnerHTML={{ __html: renderHighlights(pageText, highlights) }}
          />
        </div>
      </main>

      {/* Color picker */}
      {colorPicker && (
        <div
          className="fixed z-50 bg-white shadow-xl rounded-full px-3 py-2 flex items-center gap-1.5 border border-gray-100"
          style={{ left: colorPicker.x - 100, top: colorPicker.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => saveHighlight(color)}
              className="w-6 h-6 rounded-full border border-white/50 shadow-sm hover:scale-125 transition-transform"
              style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
            />
          ))}
          <button
            onClick={() => setColorPicker(null)}
            className="ml-1 text-gray-400 hover:text-gray-700 text-xs leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom nav */}
      <footer className={`sticky bottom-0 z-10 border-t px-4 py-3 ${t.toolbar} ${t.border}`}>
        <div className="max-w-[65ch] mx-auto">
          <div className={`h-1 rounded-full mb-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={goToPrev}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-25 ${t.btn}`}
            >
              ← Prev
            </button>
            <span className="text-xs opacity-40 tabular-nums">
              {currentPage} / {book?.pageCount}
            </span>
            <button
              onClick={goToNext}
              disabled={currentPage === (book?.pageCount ?? 1)}
              className={`px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-25 ${t.btn}`}
            >
              Next →
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
