'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/hooks/useAuth';
import { getBooks, getProgressForBooks } from '@/lib/firestore';
import type { Book, ReadingProgress } from '@/types';

export default function LibraryPage() {
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);

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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-serif font-bold text-gray-900">Lexis</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
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

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
            </div>
          ) : books.length === 0 ? (
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
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-5">
              {books.map((book) => (
                <BookCard key={book.id} book={book} progress={progress[book.id]} />
              ))}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}

function BookCard({ book, progress }: { book: Book; progress?: ReadingProgress }) {
  const pct = progress?.percentComplete ?? 0;
  const lastRead = progress?.lastReadAt
    ? new Date(progress.lastReadAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <Link href={`/reader/${book.id}`} className="group block">
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
            <div
              className="h-full bg-amber-400 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {lastRead && (
          <p className="text-xs text-gray-400 mt-0.5">{pct}% · {lastRead}</p>
        )}
      </div>
    </Link>
  );
}
