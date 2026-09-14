// Offline book cache — the *extracted text* of a book, kept in the browser.
//
// Only what the reader view needs is stored: the page text/segments plus the
// book's metadata. The original PDF/EPUB is deliberately left in Storage, so a
// saved book costs kilobytes-to-megabytes rather than the whole file, and the
// PDF/EPUB view still needs a connection.
//
// IndexedDB rather than localStorage: a single book's pages.json routinely runs
// past localStorage's ~5 MB budget for the whole origin.

import type { Book, PageData } from '@/types';

const DB_NAME = 'lexis-offline';
const DB_VERSION = 1;
const STORE = 'books';

export interface OfflineBook {
  /** Key path — the Firestore book id. */
  bookId: string;
  /** Book metadata as of the moment it was saved, so the reader can open it
   *  (title, page count, TOC, cover) with no network at all. */
  book: Book;
  pages: PageData[];
  savedAt: number;
  /** Size of the stored text in bytes, for the library's usage readout. */
  bytes: number;
}

export function offlineSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!offlineSupported()) {
      reject(new Error('This browser has no IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'bookId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the offline library'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = fn(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Offline storage failed'));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Every book currently held offline, newest save first — metadata only. */
export async function listOfflineBooks(): Promise<Omit<OfflineBook, 'pages'>[]> {
  if (!offlineSupported()) return [];
  try {
    const all = await run<OfflineBook[]>('readonly', (store) => store.getAll());
    return all
      .map(({ bookId, book, savedAt, bytes }) => ({ bookId, book, savedAt, bytes }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function getOfflineBook(bookId: string): Promise<OfflineBook | null> {
  if (!offlineSupported()) return null;
  try {
    return (await run<OfflineBook | undefined>('readonly', (store) => store.get(bookId))) ?? null;
  } catch {
    return null;
  }
}

export async function saveOfflineBook(book: Book, pages: PageData[]): Promise<OfflineBook> {
  const record: OfflineBook = {
    bookId: book.id,
    book,
    pages,
    savedAt: Date.now(),
    bytes: new TextEncoder().encode(JSON.stringify(pages)).length,
  };
  await run('readwrite', (store) => store.put(record));
  // Ask the browser not to evict us under storage pressure. Best-effort: it may
  // resolve false (or not exist at all) and the cache still works.
  try { await navigator.storage?.persist?.(); } catch {}
  return record;
}

export async function removeOfflineBook(bookId: string): Promise<void> {
  if (!offlineSupported()) return;
  try {
    await run('readwrite', (store) => store.delete(bookId));
  } catch {}
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
