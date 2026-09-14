'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import TagInput from '@/components/TagInput';
import { CheckIcon, DownloadIcon, SpinnerIcon } from '@/components/icons';
import { useAuth } from '@/hooks/useAuth';
import { getBooks, getProgressForBooks, updateBook, deleteBook, getStorageJson } from '@/lib/firestore';
import {
  listOfflineBooks,
  offlineSupported,
  removeOfflineBook,
  saveOfflineBook,
  formatBytes,
} from '@/lib/offline';
import { applyStoredTheme } from '@/lib/theme';
import type { Book, ExtractedBook, ReadingProgress } from '@/types';

/** What the library needs to know about a book held offline. */
interface OfflineEntry {
  savedAt: number;
  bytes: number;
}

export default function LibraryPage() {
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [offlineBooks, setOfflineBooks] = useState<Record<string, OfflineEntry>>({});
  const [offlineBusy, setOfflineBusy] = useState<Record<string, boolean>>({});
  const [offlineError, setOfflineError] = useState<string | null>(null);
  // Resolved after mount: IndexedDB doesn't exist during SSR, and branching on
  // it while rendering would desync hydration.
  const [offlineReady, setOfflineReady] = useState(false);

  // Theme and font are whatever was last chosen in any book — re-apply them on
  // mount so a change made in another tab shows up here too. (On a cold load
  // the inline script in the root layout has already done this before paint.)
  useEffect(() => { applyStoredTheme(); }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([getBooks(user.uid), getProgressForBooks(user.uid)]).then(
      ([fetchedBooks, fetchedProgress]) => {
        setBooks(fetchedBooks.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()));
        setProgress(fetchedProgress);
        setLoading(false);
      },
    );
  }, [user]);

  useEffect(() => {
    listOfflineBooks().then((saved) => {
      setOfflineReady(offlineSupported());
      setOfflineBooks(
        Object.fromEntries(saved.map((s) => [s.bookId, { savedAt: s.savedAt, bytes: s.bytes }])),
      );
    });
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => b.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [books]);

  // Tags sorted by book count descending
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    books.forEach((b) => b.tags?.forEach((t) => { counts[t] = (counts[t] ?? 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [books]);

  const offlineTotal = useMemo(() => {
    const entries = Object.values(offlineBooks);
    return { count: entries.length, bytes: entries.reduce((sum, e) => sum + e.bytes, 0) };
  }, [offlineBooks]);

  const filteredBooks = useMemo(
    () => (activeTag ? books.filter((b) => b.tags?.includes(activeTag)) : books),
    [books, activeTag],
  );

  const closeSidebarIfMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) setSidebarOpen(false);
  }, []);

  const handleBookSaved = useCallback((updated: Book) => {
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setEditingBook(null);
  }, []);

  const handleDelete = useCallback(
    async (bookId: string) => {
      if (!user) return;
      await deleteBook(user.uid, bookId);
      await removeOfflineBook(bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
      setOfflineBooks((prev) => {
        const next = { ...prev };
        delete next[bookId];
        return next;
      });
    },
    [user],
  );

  // Store (or drop) a book's extracted text in the browser. Only the text —
  // the original PDF/EPUB stays in the cloud.
  const handleToggleOffline = useCallback(
    async (book: Book) => {
      setOfflineError(null);
      setOfflineBusy((prev) => ({ ...prev, [book.id]: true }));
      try {
        if (offlineBooks[book.id]) {
          await removeOfflineBook(book.id);
          setOfflineBooks((prev) => {
            const next = { ...prev };
            delete next[book.id];
            return next;
          });
        } else {
          const extracted = await getStorageJson<ExtractedBook>(book.textStoragePath);
          const saved = await saveOfflineBook(book, extracted.pages);
          setOfflineBooks((prev) => ({
            ...prev,
            [book.id]: { savedAt: saved.savedAt, bytes: saved.bytes },
          }));
        }
      } catch (err) {
        setOfflineError(
          `Couldn't save “${book.title}” for offline reading: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        );
      } finally {
        setOfflineBusy((prev) => {
          const next = { ...prev };
          delete next[book.id];
          return next;
        });
      }
    },
    [offlineBooks],
  );

  return (
    <AuthGuard>
      <div
        className="min-h-screen bg-lexis-bg text-lexis-fg flex"
        style={{ fontFamily: 'var(--lexis-font)' }}
      >

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside
          className="fixed sm:relative top-0 left-0 bottom-0 z-30 sm:z-auto flex flex-col bg-lexis-panel border-r border-lexis-border shrink-0 transition-all duration-200 overflow-hidden"
          style={{ width: sidebarOpen ? '13rem' : 0 }}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-lexis-border shrink-0" style={{ minWidth: '13rem' }}>
            <span className="text-xs font-semibold text-lexis-muted uppercase tracking-wide">Tags</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-lexis-muted hover:text-lexis-fg transition-colors leading-none"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5" style={{ minWidth: '13rem' }}>
            <button
              onClick={() => { setActiveTag(null); closeSidebarIfMobile(); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                !activeTag
                  ? 'bg-lexis-accent-bg text-lexis-accent font-medium'
                  : 'text-lexis-muted hover:bg-lexis-hover'
              }`}
            >
              <span>All books</span>
              <span className="text-xs tabular-nums opacity-50">{books.length}</span>
            </button>

            {tagCounts.length === 0 ? (
              <p className="px-3 py-6 text-xs text-lexis-muted opacity-70 text-center">No tags yet</p>
            ) : (
              tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => { setActiveTag(activeTag === tag ? null : tag); closeSidebarIfMobile(); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeTag === tag
                      ? 'bg-lexis-accent-bg text-lexis-accent font-medium'
                      : 'text-lexis-muted hover:bg-lexis-hover'
                  }`}
                >
                  <span className="truncate text-left">{tag}</span>
                  <span className="text-xs tabular-nums opacity-50 shrink-0 ml-2">{count}</span>
                </button>
              ))
            )}
          </nav>

          {offlineTotal.count > 0 && (
            <div
              className="px-4 py-3 border-t border-lexis-border shrink-0 text-xs text-lexis-muted"
              style={{ minWidth: '13rem' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon size={12} className="text-lexis-accent" />
                {offlineTotal.count} saved offline
              </span>
              <span className="block opacity-70 mt-0.5 tabular-nums">
                {formatBytes(offlineTotal.bytes)} of text on this device
              </span>
            </div>
          )}
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="bg-lexis-panel border-b border-lexis-border px-5 py-4 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="shrink-0 flex flex-col gap-[4px] justify-center text-lexis-muted hover:text-lexis-fg transition-colors"
              aria-label="Toggle tag sidebar"
            >
              <span className="block w-5 h-[1.5px] bg-current rounded-full transition-all" />
              <span className="block w-5 h-[1.5px] bg-current rounded-full transition-all" />
              <span
                className="block h-[1.5px] bg-current rounded-full transition-all"
                style={{ width: sidebarOpen ? '1.25rem' : '0.875rem' }}
              />
            </button>
            <h1 className="text-xl font-bold flex-1">Lexis</h1>
            <span className="text-xs text-lexis-muted hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-lexis-muted hover:text-lexis-fg transition-colors">
              Sign out
            </button>
          </header>

          <main className="max-w-5xl mx-auto w-full px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold flex items-center gap-2">
                {activeTag ? (
                  <>
                    <span className="text-lexis-muted font-normal text-sm">Tagged</span>
                    <span className="px-2.5 py-0.5 bg-lexis-accent-bg text-lexis-accent rounded-full text-sm">{activeTag}</span>
                    <button
                      onClick={() => setActiveTag(null)}
                      className="text-xs text-lexis-muted hover:text-lexis-fg transition-colors"
                      title="Clear filter"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  'My Library'
                )}
              </h2>
              <Link
                href="/upload"
                className="px-4 py-2 bg-lexis-fg text-lexis-bg text-sm rounded-lg hover:opacity-80 transition-opacity"
              >
                + Upload book
              </Link>
            </div>

            {offlineError && (
              <p className="mb-4 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg flex items-start justify-between gap-3">
                <span>{offlineError}</span>
                <button onClick={() => setOfflineError(null)} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
              </p>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-lexis-border border-t-transparent animate-spin" />
              </div>
            ) : filteredBooks.length === 0 && books.length === 0 ? (
              <div className="text-center py-24">
                <div className="text-5xl mb-4">📚</div>
                <p className="text-lexis-muted font-medium">Your library is empty</p>
                <p className="text-sm text-lexis-muted opacity-70 mt-1 mb-6">Upload a PDF or EPUB to start reading</p>
                <Link
                  href="/upload"
                  className="inline-block px-5 py-2.5 bg-lexis-fg text-lexis-bg text-sm rounded-lg hover:opacity-80 transition-opacity"
                >
                  Upload your first book
                </Link>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-lexis-muted text-sm mb-2">No books tagged &ldquo;{activeTag}&rdquo;</p>
                <button
                  onClick={() => setActiveTag(null)}
                  className="text-sm text-lexis-accent hover:opacity-80 transition-opacity"
                >
                  Show all books
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
                {filteredBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    progress={progress[book.id]}
                    offlineReady={offlineReady}
                    offline={offlineBooks[book.id]}
                    offlineBusy={!!offlineBusy[book.id]}
                    onToggleOffline={() => handleToggleOffline(book)}
                    onEdit={() => setEditingBook(book)}
                    onDelete={() => handleDelete(book.id)}
                    onTagClick={(tag) => setActiveTag(tag)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {editingBook && (
        <BookEditModal
          book={editingBook}
          allTags={allTags}
          onSaved={handleBookSaved}
          onClose={() => setEditingBook(null)}
        />
      )}
    </AuthGuard>
  );
}

// ── BookCard ──────────────────────────────────────────────────────────────────

function BookCard({
  book,
  progress,
  offlineReady,
  offline,
  offlineBusy,
  onToggleOffline,
  onEdit,
  onDelete,
  onTagClick,
}: {
  book: Book;
  progress?: ReadingProgress;
  offlineReady: boolean;
  offline?: OfflineEntry;
  offlineBusy: boolean;
  onToggleOffline: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pct = progress?.percentComplete ?? 0;
  const lastRead = progress?.lastReadAt
    ? new Date(progress.lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
  };

  const offlineLabel = offlineBusy
    ? 'Working…'
    : offline
      ? `Saved on this device (${formatBytes(offline.bytes)}) — tap to remove`
      : 'Save the text on this device for offline reading';

  return (
    <div className="relative">
      {/* Offline toggle — stores only the extracted text, never the original file */}
      {offlineReady && (
        <button
          onClick={(e) => { e.preventDefault(); if (!offlineBusy) onToggleOffline(); }}
          disabled={offlineBusy}
          className={`absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
            offline ? '' : 'bg-black/40 text-white hover:bg-black/60'
          }`}
          style={offline ? { backgroundColor: 'var(--lexis-accent)', color: 'var(--lexis-bg)' } : undefined}
          title={offlineLabel}
          aria-label={offlineLabel}
          aria-pressed={!!offline}
        >
          {offlineBusy ? <SpinnerIcon /> : offline ? <CheckIcon /> : <DownloadIcon />}
        </button>
      )}

      {/* ⋮ menu button */}
      <div ref={menuRef} className="absolute top-1.5 right-1.5 z-10">
        <button
          onClick={(e) => { e.preventDefault(); setMenuOpen((o) => !o); setConfirming(false); }}
          className="w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors text-base leading-none"
          aria-label="Book options"
        >
          ⋮
        </button>

        {menuOpen && (
          <div className="absolute top-8 right-0 bg-lexis-panel text-lexis-fg rounded-xl shadow-xl border border-lexis-border overflow-hidden min-w-[130px]">
            {confirming ? (
              <div className="p-3">
                <p className="text-xs mb-2 font-medium">Delete this book?</p>
                <p className="text-xs text-lexis-muted mb-3">This cannot be undone.</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={(e) => { e.preventDefault(); setConfirming(false); }}
                    className="flex-1 py-1.5 text-xs border border-lexis-border rounded-lg hover:bg-lexis-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(); }}
                    disabled={deleting}
                    className="flex-1 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={(e) => { e.preventDefault(); setMenuOpen(false); onEdit(); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-lexis-hover transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); setConfirming(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors border-t border-lexis-border"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Link
        href={`/reader/${book.id}`}
        className="block"
        onClick={() => { try { localStorage.setItem('lexis-last-book', book.id); } catch {} }}
      >
        <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative">
          {book.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.thumbnailUrl}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-end p-3"
              style={{ backgroundColor: book.coverColor }}
            >
              <span className="text-white text-xs font-semibold line-clamp-3 leading-tight drop-shadow-sm">
                {book.title}
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 px-0.5">
          <p className="text-xs font-medium truncate leading-tight">{book.title}</p>
          {pct > 0 && (
            <div className="mt-1.5 h-1 bg-lexis-track rounded-full overflow-hidden">
              <div className="h-full bg-lexis-accent rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}
          {lastRead && <p className="text-xs text-lexis-muted mt-0.5">{pct}% · {lastRead}</p>}
          {book.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {book.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => { e.preventDefault(); onTagClick(tag); }}
                  className="px-1.5 py-0.5 bg-lexis-hover text-lexis-muted text-xs rounded-full hover:bg-lexis-accent-bg hover:text-lexis-accent transition-colors leading-tight"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

// ── BookEditModal ─────────────────────────────────────────────────────────────

function BookEditModal({
  book,
  allTags,
  onSaved,
  onClose,
}: {
  book: Book;
  allTags: string[];
  onSaved: (updated: Book) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(book.title);
  const [tags, setTags] = useState<string[]>(book.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pendingTag, setPendingTag] = useState('');

  const quickAddTags = allTags.filter((t) => !tags.includes(t));

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    setSaveError('');
    try {
      const p = pendingTag.trim();
      const finalTags = p && !tags.includes(p) ? [...tags, p] : tags;
      await updateBook(user.uid, book.id, { title: title.trim(), tags: finalTags });
      onSaved({ ...book, title: title.trim(), tags: finalTags });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      style={{ fontFamily: 'var(--lexis-font)' }}
    >
      <div
        className="bg-lexis-panel text-lexis-fg rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 border border-lexis-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Edit book</h2>

        <div>
          <label className="block text-xs font-medium text-lexis-muted mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            autoFocus
            className="w-full px-3 py-2 bg-lexis-bg border border-lexis-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-lexis-accent focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-lexis-muted mb-1">Tags</label>

          {/* Quick-select existing tags */}
          {quickAddTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickAddTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((prev) => [...prev, t])}
                  className="px-2.5 py-1 text-xs rounded-full border border-dashed border-lexis-border text-lexis-muted hover:border-lexis-accent hover:text-lexis-accent hover:bg-lexis-accent-bg transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
          )}

          <TagInput value={tags} onChange={setTags} suggestions={allTags} onPendingChange={setPendingTag} />
        </div>

        {saveError && (
          <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{saveError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-lexis-border text-sm rounded-lg hover:bg-lexis-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 py-2 bg-lexis-fg text-lexis-bg text-sm rounded-lg hover:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
