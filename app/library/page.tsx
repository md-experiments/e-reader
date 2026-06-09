'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import TagInput from '@/components/TagInput';
import { useAuth } from '@/hooks/useAuth';
import { getBooks, getProgressForBooks, updateBook, deleteBook } from '@/lib/firestore';
import type { Book, ReadingProgress } from '@/types';

export default function LibraryPage() {
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const filteredBooks = useMemo(
    () => (activeTag ? books.filter((b) => b.tags?.includes(activeTag)) : books),
    [books, activeTag],
  );

  const closeSidebarIfMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) setSidebarOpen(false);
  }, []);

  const handleSaveEdit = useCallback(
    async (bookId: string, newTitle: string, newTags: string[]) => {
      if (!user) return;
      await updateBook(user.uid, bookId, { title: newTitle, tags: newTags });
      setBooks((prev) =>
        prev.map((b) => (b.id === bookId ? { ...b, title: newTitle, tags: newTags } : b)),
      );
      setEditingBook(null);
    },
    [user],
  );

  const handleDelete = useCallback(
    async (bookId: string) => {
      if (!user) return;
      await deleteBook(user.uid, bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    },
    [user],
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 flex">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside
          className="fixed sm:relative top-0 left-0 bottom-0 z-30 sm:z-auto flex flex-col bg-white border-r border-gray-100 shrink-0 transition-all duration-200 overflow-hidden"
          style={{ width: sidebarOpen ? '13rem' : 0 }}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0" style={{ minWidth: '13rem' }}>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-700 transition-colors leading-none"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5" style={{ minWidth: '13rem' }}>
            <button
              onClick={() => { setActiveTag(null); closeSidebarIfMobile(); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                !activeTag ? 'bg-amber-50 text-amber-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>All books</span>
              <span className="text-xs tabular-nums opacity-50">{books.length}</span>
            </button>

            {tagCounts.length === 0 ? (
              <p className="px-3 py-6 text-xs text-gray-400 text-center">No tags yet</p>
            ) : (
              tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => { setActiveTag(activeTag === tag ? null : tag); closeSidebarIfMobile(); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeTag === tag
                      ? 'bg-amber-50 text-amber-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate text-left">{tag}</span>
                  <span className="text-xs tabular-nums opacity-50 shrink-0 ml-2">{count}</span>
                </button>
              ))
            )}
          </nav>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="shrink-0 flex flex-col gap-[4px] justify-center text-gray-500 hover:text-gray-900 transition-colors"
              aria-label="Toggle tag sidebar"
            >
              <span className="block w-5 h-[1.5px] bg-current rounded-full transition-all" />
              <span className="block w-5 h-[1.5px] bg-current rounded-full transition-all" />
              <span
                className="block h-[1.5px] bg-current rounded-full transition-all"
                style={{ width: sidebarOpen ? '1.25rem' : '0.875rem' }}
              />
            </button>
            <h1 className="text-xl font-serif font-bold text-gray-900 flex-1">Lexis</h1>
            <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
              Sign out
            </button>
          </header>

          <main className="max-w-5xl mx-auto w-full px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                {activeTag ? (
                  <>
                    <span className="text-gray-400 font-normal text-sm">Tagged</span>
                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-sm">{activeTag}</span>
                    <button
                      onClick={() => setActiveTag(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
                className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                + Upload book
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
              </div>
            ) : filteredBooks.length === 0 && books.length === 0 ? (
              <div className="text-center py-24">
                <div className="text-5xl mb-4">📚</div>
                <p className="text-gray-500 font-medium">Your library is empty</p>
                <p className="text-sm text-gray-400 mt-1 mb-6">Upload a PDF or EPUB to start reading</p>
                <Link
                  href="/upload"
                  className="inline-block px-5 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Upload your first book
                </Link>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-sm mb-2">No books tagged &ldquo;{activeTag}&rdquo;</p>
                <button
                  onClick={() => setActiveTag(null)}
                  className="text-sm text-amber-600 hover:text-amber-700 transition-colors"
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
          onSave={handleSaveEdit}
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
  onEdit,
  onDelete,
  onTagClick,
}: {
  book: Book;
  progress?: ReadingProgress;
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

  return (
    <div className="relative">
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
          <div className="absolute top-8 right-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden min-w-[130px]">
            {confirming ? (
              <div className="p-3">
                <p className="text-xs text-gray-700 mb-2 font-medium">Delete this book?</p>
                <p className="text-xs text-gray-400 mb-3">This cannot be undone.</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={(e) => { e.preventDefault(); setConfirming(false); }}
                    className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
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
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); setConfirming(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors border-t border-gray-100"
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
          <p className="text-xs text-gray-700 font-medium truncate leading-tight">{book.title}</p>
          {pct > 0 && (
            <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}
          {lastRead && <p className="text-xs text-gray-400 mt-0.5">{pct}% · {lastRead}</p>}
          {book.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {book.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => { e.preventDefault(); onTagClick(tag); }}
                  className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full hover:bg-amber-100 hover:text-amber-700 transition-colors leading-tight"
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
  onSave,
  onClose,
}: {
  book: Book;
  allTags: string[];
  onSave: (bookId: string, title: string, tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [tags, setTags] = useState<string[]>(book.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pendingTag, setPendingTag] = useState('');

  const quickAddTags = allTags.filter((t) => !tags.includes(t));

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      // Flush any typed-but-unconfirmed tag
      const p = pendingTag.trim();
      const finalTags = p && !tags.includes(p) ? [...tags, p] : tags;
      await onSave(book.id, title.trim(), finalTags);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900">Edit book</h2>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            autoFocus
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>

          {/* Quick-select existing tags */}
          {quickAddTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickAddTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((prev) => [...prev, t])}
                  className="px-2.5 py-1 text-xs rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  + {t}
                </button>
              ))}
            </div>
          )}

          <TagInput value={tags} onChange={setTags} suggestions={allTags} onPendingChange={setPendingTag} />
        </div>

        {saveError && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-1 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
