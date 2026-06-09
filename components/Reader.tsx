'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  getBook,
  getProgress,
  saveProgress,
  updateBook,
  getHighlightsForPage,
  getHighlightsForBook,
  addHighlight,
  deleteHighlight,
  updateHighlightNote,
  getStorageJson,
  getTranslation,
  saveTranslation,
} from '@/lib/firestore';
import { renderHighlights, HIGHLIGHT_COLORS } from '@/components/Highlights';
import PdfViewer from '@/components/PdfViewer';
import EpubViewer from '@/components/EpubViewer';
import TocSidebar from '@/components/TocSidebar';
import HighlightsPanel from '@/components/HighlightsPanel';
import type { Book, PageData, Highlight, HighlightColor, ExtractedBook, TocEntry } from '@/types';

// ── Themes ────────────────────────────────────────────────────────────────────

type Theme = 'light' | 'sepia' | 'dark' | 'navy';

interface ThemeConfig {
  bg: string;
  fg: string;
  border: string;
  hover: string;
  track: string;
  swatch: string;
  label: string;
}

const THEMES: Record<Theme, ThemeConfig> = {
  light: { bg: '#ffffff', fg: '#111827', border: '#e5e7eb', hover: '#f3f4f6', track: '#e5e7eb', swatch: '#ffffff', label: 'Light' },
  sepia: { bg: '#fef8f0', fg: '#78350f', border: '#f9d8a0', hover: '#fde68a', track: '#f9d8a0', swatch: '#fef8f0', label: 'Sepia' },
  dark:  { bg: '#0a0a0a', fg: '#e5e7eb', border: '#1f2937', hover: '#1f2937', track: '#1f2937', swatch: '#0a0a0a', label: 'Dark' },
  navy:  { bg: '#0d1b2e', fg: '#d4af6e', border: '#1e3a5f', hover: '#1e3a5f', track: '#1e3a5f', swatch: '#0d1b2e', label: 'Navy' },
};

// ── Fonts ─────────────────────────────────────────────────────────────────────

type FontFamily = 'georgia' | 'merriweather' | 'lora' | 'source-serif' | 'sans';

interface FontConfig {
  label: string;
  style: string;
}

const FONTS: Record<FontFamily, FontConfig> = {
  georgia:       { label: 'Georgia',      style: "Georgia, 'Times New Roman', serif" },
  merriweather:  { label: 'Merriweather', style: 'var(--font-merriweather), serif' },
  lora:          { label: 'Lora',         style: 'var(--font-lora), serif' },
  'source-serif': { label: 'Source Serif', style: 'var(--font-source-serif), serif' },
  sans:          { label: 'Sans',         style: 'var(--font-geist), system-ui, sans-serif' },
};

// ── Settings persistence ──────────────────────────────────────────────────────

const SETTINGS_KEY = 'lexis-reader-settings';

function loadSetting<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return key in parsed ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

function saveSettings(settings: Record<string, unknown>) {
  try {
    const existing = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...settings }));
  } catch {}
}

// ── Page content (memoised) ───────────────────────────────────────────────────
// Kept in a separate memo component so that state changes in the parent
// (e.g. colorPicker appearing) don't cause React to reconcile the content div.
// Without this, React would re-run dangerouslySetInnerHTML, and on iOS Safari
// any DOM touch—even a no-op—can drop the visual text-selection highlight.

interface PageContentProps {
  html: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  fontFamily: FontFamily;
}

const PageContent = memo(function PageContent({ html, contentRef, fontSize, fontFamily }: PageContentProps) {
  return (
    <div
      ref={contentRef}
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.9, fontFamily: FONTS[fontFamily].style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

// ── Component ─────────────────────────────────────────────────────────────────

interface ColorPickerState {
  x: number;
  y: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export default function Reader({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [viewMode, setViewMode] = useState<'reader' | 'pdf' | 'translation'>('reader');
  const [showToc, setShowToc] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [showHighlightsPanel, setShowHighlightsPanel] = useState(false);
  const [allHighlights, setAllHighlights] = useState<Highlight[]>([]);
  const [allHighlightsLoading, setAllHighlightsLoading] = useState(false);
  const pendingScrollToHighlight = useRef<string | null>(null);

  // Settings — initialised from localStorage immediately to avoid flash
  const [fontSize, setFontSize] = useState<number>(() => loadSetting('fontSize', 18));
  const [theme, setTheme] = useState<Theme>(() => loadSetting('theme', 'light'));
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => loadSetting('fontFamily', 'georgia'));

  const contentRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the highlight bar is locked-in (visible). Read by the
  // selectionchange handler (which has a stale closure) and by dismiss().
  const colorPickerActiveRef = useRef(false);

  // Scroll position persistence
  const scrollRestoredRef = useRef(false);
  const scrollSavingEnabled = useRef(false);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { colorPickerActiveRef.current = colorPicker !== null; }, [colorPicker]);

  // Persist settings whenever they change
  useEffect(() => { saveSettings({ fontSize }); }, [fontSize]);
  useEffect(() => { saveSettings({ theme }); }, [theme]);
  useEffect(() => { saveSettings({ fontFamily }); }, [fontFamily]);

  // Remember this as the last opened book
  useEffect(() => {
    try { localStorage.setItem('lexis-last-book', bookId); } catch {}
  }, [bookId]);

  // Once loading completes: restore saved scroll position for the initial page
  useEffect(() => {
    if (loading) return;
    if (scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    try {
      const saved = localStorage.getItem(`lexis-scroll-${bookId}-${currentPage}`);
      const top = saved ? parseInt(saved, 10) : 0;
      requestAnimationFrame(() => {
        mainRef.current?.scrollTo({ top });
        setTimeout(() => { scrollSavingEnabled.current = true; }, 200);
      });
    } catch {
      setTimeout(() => { scrollSavingEnabled.current = true; }, 200);
    }
  }, [loading, bookId, currentPage]);

  // On page navigation: save the scroll position of the page being left, then
  // restore the saved position for the new page. The cleanup runs synchronously
  // before the new effect, while main.scrollTop still reflects the old page —
  // this is more reliable than the debounced handleScroll save, which can fire
  // with a stale currentPageRef if the user navigates quickly.
  useEffect(() => {
    if (!scrollRestoredRef.current) return;

    // Cleanup: capture position of the page we're leaving.
    return () => {
      const top = mainRef.current?.scrollTop ?? 0;
      try { localStorage.setItem(`lexis-scroll-${bookId}-${currentPage}`, String(top)); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, bookId]);  // currentPage/bookId captured in closure for the save

  // Restore the saved position after the above cleanup has run.
  useEffect(() => {
    if (!scrollRestoredRef.current) return;
    scrollSavingEnabled.current = false;
    try {
      const saved = localStorage.getItem(`lexis-scroll-${bookId}-${currentPage}`);
      const top = saved ? parseInt(saved, 10) : 0;
      requestAnimationFrame(() => {
        mainRef.current?.scrollTo({ top });
        setTimeout(() => { scrollSavingEnabled.current = true; }, 200);
      });
    } catch {
      mainRef.current?.scrollTo({ top: 0 });
      setTimeout(() => { scrollSavingEnabled.current = true; }, 200);
    }
  }, [currentPage, bookId]);

  // Load book + progress
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
      const json = await getStorageJson<ExtractedBook>(bookData.textStoragePath);
      setPages(json.pages);
      setLoading(false);
    })();
  }, [user, bookId]);

  // Load highlights for current page
  useEffect(() => {
    if (!user) return;
    getHighlightsForPage(user.uid, bookId, currentPage).then(setHighlights);
  }, [user, bookId, currentPage]);

  // Reset translation state when navigating pages
  useEffect(() => {
    setTranslatedText(null);
    setTranslationLoading(false);
    if (viewMode === 'translation') setViewMode('reader');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Debounced progress save
  useEffect(() => {
    if (!user || !book || loading) return;
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      saveProgress(user.uid, bookId, currentPage, book.pageCount);
    }, 2000);
    return () => { if (progressTimer.current) clearTimeout(progressTimer.current); };
  }, [user, bookId, currentPage, book, loading]);

  // Show the highlight colour bar when the user has a stable non-collapsed
  // selection inside the reading content.
  //
  // Two timers prevent the common failure modes:
  //  • showTimer (500 ms): only fires after the selection has been stable for
  //    500 ms, so single taps and in-progress handle drags don't trigger it.
  //  • clearTimer (200 ms grace): absorbs the momentary selection collapse that
  //    browsers fire during a click event before re-confirming the selection,
  //    which previously caused the bar to flash and disappear on desktop.
  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    const onSelectionChange = () => {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !contentRef.current) {
        // When the bar is locked-in (visible), the user may have clicked the
        // note input or another part of the bar — don't auto-clear on selection
        // collapse. Dismissal is now handled explicitly by dismiss() or the ✕
        // button.
        if (colorPickerActiveRef.current) return;
        // Otherwise start grace-period before clearing — a real deselect will
        // survive it; a click-induced momentary collapse will be cancelled.
        if (!clearTimer) {
          clearTimer = setTimeout(() => { clearTimer = null; setColorPicker(null); }, 200);
        }
        return;
      }

      // Non-collapsed selection — cancel any pending clear
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }

      const selectedText = sel.toString().trim();
      if (!selectedText || selectedText.length < 2) return;

      showTimer = setTimeout(() => {
        showTimer = null;
        const s = window.getSelection();
        if (!s || s.isCollapsed || !contentRef.current) return;
        const text = s.toString().trim();
        if (!text || text.length < 2) return;
        try {
          const range = s.getRangeAt(0);
          if (!contentRef.current.contains(range.commonAncestorContainer)) return;
          const preRange = document.createRange();
          preRange.setStart(contentRef.current, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const startOffset = preRange.toString().length;
          setNoteInput('');
          setColorPicker({ x: 0, y: 0, text, startOffset, endOffset: startOffset + text.length });
        } catch { /* selection became invalid */ }
      }, 500);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (showTimer) clearTimeout(showTimer);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, []);

  // Fetch all highlights when the panel opens
  useEffect(() => {
    if (!showHighlightsPanel || !user) return;
    setAllHighlightsLoading(true);
    getHighlightsForBook(user.uid, bookId).then((hs) => {
      setAllHighlights(hs);
      setAllHighlightsLoading(false);
    });
  }, [showHighlightsPanel, user, bookId]);

  // After highlights load for a page, scroll to a pending highlight mark
  useEffect(() => {
    if (!pendingScrollToHighlight.current) return;
    const id = pendingScrollToHighlight.current;
    pendingScrollToHighlight.current = null;
    setTimeout(() => {
      document.getElementById(`hl-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, [highlights]);

  const saveHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!user || !colorPicker) return;
      const note = noteInput.trim() || undefined;
      const h = await addHighlight(user.uid, {
        bookId,
        text: colorPicker.text,
        pageNumber: currentPage,
        color,
        startOffset: colorPicker.startOffset,
        endOffset: colorPicker.endOffset,
        ...(note ? { note } : {}),
      });
      setHighlights((prev) => [...prev, h]);
      setAllHighlights((prev) => [...prev, h]);
      window.getSelection()?.removeAllRanges();
      setNoteInput('');
      setColorPicker(null);
    },
    [user, colorPicker, noteInput, bookId, currentPage],
  );

  const handleScroll = useCallback(() => {
    if (!scrollSavingEnabled.current) return;
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      const top = mainRef.current?.scrollTop ?? 0;
      try { localStorage.setItem(`lexis-scroll-${bookId}-${currentPageRef.current}`, String(top)); } catch {}
    }, 500);
  }, [bookId]);

  const navigateToHighlight = useCallback((h: Highlight) => {
    setShowHighlightsPanel(false);
    if (h.pageNumber === currentPage) {
      // Already on the right page — setCurrentPage would be a no-op, so the
      // pending-scroll effect would never fire. Scroll directly instead.
      setTimeout(() => {
        document.getElementById(`hl-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    } else {
      pendingScrollToHighlight.current = h.id;
      setCurrentPage(h.pageNumber);
    }
  }, [currentPage]);

  const handleDeleteHighlight = useCallback(async (h: Highlight) => {
    if (!user) return;
    await deleteHighlight(user.uid, h.id);
    setAllHighlights((prev) => prev.filter((x) => x.id !== h.id));
    if (h.pageNumber === currentPage) {
      setHighlights((prev) => prev.filter((x) => x.id !== h.id));
    }
  }, [user, currentPage]);

  const handleUpdateNote = useCallback(async (h: Highlight, note: string) => {
    if (!user) return;
    await updateHighlightNote(user.uid, h.id, note);
    const updated = { ...h, note: note || undefined };
    setAllHighlights((prev) => prev.map((x) => (x.id === h.id ? updated : x)));
    if (h.pageNumber === currentPage) {
      setHighlights((prev) => prev.map((x) => (x.id === h.id ? updated : x)));
    }
  }, [user, currentPage]);

  const dismiss = useCallback(() => {
    // If the highlight bar is locked-in and the user clicked outside it,
    // dismiss the bar and drop the selection.
    if (colorPickerActiveRef.current) {
      window.getSelection()?.removeAllRanges();
      setNoteInput('');
      setColorPicker(null);
    }
    setShowSettings(false);
    setShowHighlightsPanel(false);
  }, []);

  const saveToc = useCallback(
    async (newToc: TocEntry[]) => {
      if (!user || !book) return;
      await updateBook(user.uid, bookId, { toc: newToc });
      setBook((prev) => (prev ? { ...prev, toc: newToc } : prev));
    },
    [user, bookId, book],
  );

  const handleTranslate = useCallback(async () => {
    if (!user || !isAdmin) return;
    if (viewMode === 'translation') {
      setViewMode('reader');
      return;
    }
    setViewMode('translation');
    if (translatedText !== null) return; // already cached in state

    setTranslationLoading(true);
    try {
      const cached = await getTranslation(user.uid, bookId, currentPage);
      if (cached) {
        setTranslatedText(cached);
        setTranslationLoading(false);
        return;
      }

      const pageText = pages[currentPage - 1]?.text ?? '';
      const prevPageText = currentPage > 1 ? (pages[currentPage - 2]?.text ?? '') : '';
      const idToken = await user.getIdToken();
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: user.uid, text: pageText, prevPageText: prevPageText || undefined }),
      });
      if (!res.ok) throw new Error('Translation request failed');
      const { translatedText: text } = await res.json() as { translatedText: string };
      setTranslatedText(text);
      await saveTranslation(user.uid, bookId, currentPage, text);
    } catch {
      setTranslatedText('Translation failed. Please try again.');
    } finally {
      setTranslationLoading(false);
    }
  }, [user, isAdmin, viewMode, translatedText, bookId, currentPage, pages]);

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

  const t = THEMES[theme];

  // Must be before any early return (Rules of Hooks). Reads directly from state
  // to produce a stable reference for PageContent's React.memo comparison.
  const contentHtml = useMemo(() => {
    const data = pages[currentPage - 1];
    return renderHighlights(data?.text ?? '', highlights, data?.segments);
  }, [pages, currentPage, highlights]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: t.bg }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: t.border }} />
      </div>
    );
  }

  const currentPageData = pages[currentPage - 1];
  const pageText = currentPageData?.text ?? '';
  const pageSegments = currentPageData?.segments;
  const pct = Math.round((currentPage / (book?.pageCount ?? 1)) * 100);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', backgroundColor: t.bg, color: t.fg }}
      onClick={dismiss}
    >
      {/* Top toolbar */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: t.bg, borderColor: t.border }}
      >
        <Link
          href="/library"
          className="text-sm transition-opacity opacity-50 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); }}
        >
          ← Library
        </Link>
        <span className="text-sm font-medium truncate max-w-[180px] sm:max-w-xs opacity-80">
          {book?.title}
        </span>
        <div className="flex items-center gap-2">
          {viewMode === 'reader' && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowSettings((s) => !s); }}
              className="text-sm px-2 py-1 rounded opacity-50 hover:opacity-100 transition-opacity"
            >
              Aa
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowHighlightsPanel((s) => !s);
              setShowSettings(false);
              setShowToc(false);
            }}
            className="text-xs px-2.5 py-1 rounded border transition-colors"
            style={{
              borderColor: t.border,
              color: t.fg,
              backgroundColor: showHighlightsPanel ? t.hover : 'transparent',
              opacity: showHighlightsPanel ? 1 : 0.55,
            }}
            title="Highlights"
          >
            ✦
          </button>
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); handleTranslate(); setShowSettings(false); }}
              className="text-xs px-2.5 py-1 rounded border transition-colors"
              style={{
                borderColor: t.border,
                color: viewMode === 'translation' ? '#ffffff' : t.fg,
                backgroundColor: viewMode === 'translation' ? '#2563eb' : 'transparent',
                opacity: viewMode === 'translation' ? 1 : 0.55,
              }}
            >
              BG
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowToc((s) => !s);
              setShowSettings(false);
            }}
            className="text-xs px-2.5 py-1 rounded border transition-colors"
            style={{
              borderColor: t.border,
              color: t.fg,
              backgroundColor: showToc ? t.hover : 'transparent',
              opacity: showToc ? 1 : 0.55,
            }}
          >
            TOC
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setViewMode((v) => v === 'pdf' ? 'reader' : 'pdf');
              setShowSettings(false);
            }}
            className="text-xs px-2.5 py-1 rounded border transition-colors"
            style={{
              borderColor: t.border,
              color: t.fg,
              backgroundColor: viewMode === 'pdf' ? t.hover : 'transparent',
              opacity: viewMode === 'pdf' ? 1 : 0.55,
            }}
          >
            {viewMode === 'pdf' ? 'Reader' : (book?.fileType === 'epub' ? 'HTML' : 'PDF')}
          </button>
        </div>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div
          className="sticky top-[49px] z-10 border-b px-4 py-3 flex flex-col gap-3"
          style={{ backgroundColor: t.bg, borderColor: t.border }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Row 1: font size + theme */}
          <div className="flex items-center gap-5 flex-wrap">
            {/* Font size */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize((f) => Math.max(12, f - 2))}
                className="w-7 h-7 rounded border text-xs flex items-center justify-center transition-colors"
                style={{ borderColor: t.border, color: t.fg }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                A−
              </button>
              <span className="text-xs w-6 text-center" style={{ opacity: 0.5 }}>{fontSize}</span>
              <button
                onClick={() => setFontSize((f) => Math.min(32, f + 2))}
                className="w-7 h-7 rounded border text-xs flex items-center justify-center transition-colors"
                style={{ borderColor: t.border, color: t.fg }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                A+
              </button>
            </div>

            {/* Theme swatches */}
            <div className="flex items-center gap-2">
              {(Object.entries(THEMES) as [Theme, ThemeConfig][]).map(([key, cfg]) => (
                <button
                  key={key}
                  title={cfg.label}
                  onClick={() => setTheme(key)}
                  className="w-6 h-6 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: cfg.swatch,
                    borderColor: theme === key ? t.fg : 'transparent',
                    boxShadow: '0 0 0 1px rgba(128,128,128,0.25)',
                    transform: theme === key ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Row 2: font family */}
          <div className="flex items-center gap-1 flex-wrap">
            {(Object.entries(FONTS) as [FontFamily, FontConfig][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFontFamily(key)}
                className="px-2.5 py-1 rounded text-xs transition-colors border"
                style={{
                  fontFamily: cfg.style,
                  borderColor: fontFamily === key ? t.fg : 'transparent',
                  backgroundColor: fontFamily === key ? t.hover : 'transparent',
                  color: t.fg,
                  opacity: fontFamily === key ? 1 : 0.55,
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page content */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-5 py-10"
        onScroll={handleScroll}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          touchStartY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          const dy = e.changedTouches[0].clientY - touchStartY.current;
          // Only fire if clearly horizontal (dx > dy) and long enough to be intentional
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          if (dx > 0) goToPrev();
          else goToNext();
        }}
      >
        {viewMode === 'pdf' && book ? (
          <div className="max-w-3xl mx-auto">
            {book.fileType === 'epub' ? (
              <EpubViewer
                storagePath={book.storagePath}
                currentPage={currentPage}
                bgColor={t.bg}
                borderColor={t.border}
              />
            ) : (
              <PdfViewer
                storagePath={book.storagePath}
                currentPage={currentPage}
                bgColor={t.bg}
                borderColor={t.border}
              />
            )}
          </div>
        ) : viewMode === 'translation' ? (
          <div className="max-w-[65ch] mx-auto">
            {translationLoading ? (
              <div className="flex flex-col items-center gap-4 py-16" style={{ opacity: 0.5 }}>
                <div
                  className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: t.fg }}
                />
                <span className="text-sm">Translating to Bulgarian…</span>
              </div>
            ) : (
              <div
                className="select-text whitespace-pre-wrap"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.9,
                  fontFamily: FONTS[fontFamily].style,
                }}
              >
                {translatedText}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[65ch] mx-auto">
            <PageContent
              html={contentHtml}
              contentRef={contentRef}
              fontSize={fontSize}
              fontFamily={fontFamily}
            />
          </div>
        )}
      </main>

      {/* Highlight bar — always in the DOM; toggled via CSS only so that iOS
          Safari never sees a DOM mutation while a text selection is active,
          which would drop the visual selection highlight. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex flex-col border-t shadow-lg"
        style={{
          backgroundColor: t.bg,
          borderColor: t.border,
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          opacity: colorPicker ? 1 : 0,
          pointerEvents: colorPicker ? 'auto' : 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Header row: label + dismiss */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-xs font-semibold opacity-50" style={{ color: t.fg }}>Highlight</span>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              window.getSelection()?.removeAllRanges();
              setNoteInput('');
              setColorPicker(null);
            }}
            className="w-7 h-7 flex items-center justify-center rounded-full opacity-40 hover:opacity-100 active:opacity-100 transition-opacity"
            style={{ color: t.fg }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        {/* Note input */}
        <div className="px-4 pb-2">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a note (optional)…"
            className="w-full text-xs px-3 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-amber-400"
            style={{ backgroundColor: 'transparent', borderColor: t.border, color: t.fg }}
          />
        </div>
        {/* Colour swatches */}
        <div className="flex items-center justify-center gap-4 px-5 pb-3">
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((color) => (
            <button
              key={color}
              onPointerDown={(e) => { e.preventDefault(); if (colorPicker) saveHighlight(color); }}
              className="w-9 h-9 rounded-full border-2 border-white shadow-md active:scale-95 transition-transform"
              style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
            />
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <footer
        className="sticky bottom-0 z-10 border-t px-4 py-3"
        style={{ backgroundColor: t.bg, borderColor: t.border }}
      >
        <div className="max-w-[65ch] mx-auto">
          <div className="h-1 rounded-full mb-3" style={{ backgroundColor: t.track }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: '#d97706' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={goToPrev}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-25"
              style={{ color: t.fg }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              ← Prev
            </button>
            <span className="text-xs tabular-nums" style={{ opacity: 0.4 }}>
              {currentPage} / {book?.pageCount}
            </span>
            <button
              onClick={goToNext}
              disabled={currentPage === (book?.pageCount ?? 1)}
              className="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-25"
              style={{ color: t.fg }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Next →
            </button>
          </div>
        </div>
      </footer>

      {/* TOC Sidebar */}
      {showToc && (
        <TocSidebar
          toc={book?.toc ?? []}
          currentPage={currentPage}
          pageCount={book?.pageCount ?? 1}
          onNavigate={(page) => setCurrentPage(page)}
          onClose={() => setShowToc(false)}
          onSave={saveToc}
          t={t}
        />
      )}

      {/* Highlights Panel */}
      {showHighlightsPanel && (
        <HighlightsPanel
          highlights={allHighlights}
          loading={allHighlightsLoading}
          onNavigate={navigateToHighlight}
          onDelete={handleDeleteHighlight}
          onUpdateNote={handleUpdateNote}
          onClose={() => setShowHighlightsPanel(false)}
          t={t}
        />
      )}
    </div>
  );
}
