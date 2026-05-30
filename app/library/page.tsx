'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import TagInput from '@/components/TagInput';
import { useAuth } from '@/hooks/useAuth';
import { getBooks, getProgressForBooks, updateBook } from '@/lib/firestore';
import type { Book, ReadingProgress } from '@/types';

export default function LibraryPage() {
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState<Book | null>(null);

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

  const filteredBooks = useMemo(
    () => (activeTag ? books.filter((b) => b.tags?.includes(activeTag)) : books),
    [books, activeTag],
  );

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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-serif font-bold text-gray-900">Lexis</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-gray-500 hover:text-gray-900 transition-colors">
              Sign out
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-gray-900">My Library</h2>
            <Link
              href="/upload"
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
            >
              + Upload book
            </Link>
          </div>

          {/* Tag filter bar */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <button
                onClick={() => setActiveTag(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  !activeTag
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeTag === tag
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
            </div>
          ) : filteredBooks.length === 0 && books.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-5xl mb-4">📚</div>
              <p className="text-gray-500 font-medium">Your library is empty</p>
              <p className="text-sm text-gray-400 mt-1 mb-6">Upload a PDF to start reading</p>
              <Link
                href="/upload"
                className="inline-block px-5 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                Upload your first book
              </Link>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No books tagged &ldquo;{activeTag}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
              {filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={progress[book.id]}
                  onEdit={() => setEditingBook(book)}
                  onTagClick={(tag) => setActiveTag(tag)}
                />
              ))}
            </div>
          )}
        </main>
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
  onTagClick,
}: {
  book: Book;
  progress?: ReadingProgress;
  onEdit: () => void;
  onTagClick: (tag: string) => void;
}) {
  const pct = progress?.percentComplete ?? 0;
  const lastRead = progress?.lastReadAt
    ? new Date(progress.lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="group relative">
      {/* Edit button */}
      <button
        onClick={(e) => { e.preventDefault(); onEdit(); }}
        title="Edit title & tags"
        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/30 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
      >
        ✎
      </button>

      <Link href={`/reader/${book.id}`} className="block">
        <div
          className="aspect-[2/3] rounded-xl flex items-end p-3 shadow-sm group-hover:shadow-md transition-shadow"
          style={{ backgroundColor: book.coverColor }}
        >
          <span className="text-white text-xs font-semibold line-clamp-3 leading-tight drop-shadow-sm">
            {book.title}
          </span>
        </div>
        <div className="mt-2 px-0.5">
          <p className="text-xs text-gray-700 font-medium truncate leading-tight">{book.title}</p>
          {pct > 0 && (
            <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}
          {lastRead && <p className="text-xs text-gray-400 mt-0.5">{pct}% · {lastRead}</p>}
          {/* Tag badges */}
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

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(book.id, title.trim(), tags);
    setSaving(false);
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
          <TagInput value={tags} onChange={setTags} suggestions={allTags} />
        </div>

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
