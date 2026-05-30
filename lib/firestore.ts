import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadString, getBytes } from 'firebase/storage';
import { getFirebaseDb, getFirebaseStorage } from '@/lib/firebase';
import type { Book, ReadingProgress, Highlight, HighlightColor } from '@/types';

// ── Books ────────────────────────────────────────────────────────────────────

export async function createBook(
  uid: string,
  data: Omit<Book, 'id' | 'uploadedAt'>,
): Promise<Book> {
  const db = getFirebaseDb();
  const bookRef = doc(collection(db, 'users', uid, 'books'));
  const book: Book = { ...data, tags: data.tags ?? [], id: bookRef.id, uploadedAt: new Date() };
  await setDoc(bookRef, { ...book, uploadedAt: serverTimestamp() });
  return book;
}

export async function updateBook(uid: string, bookId: string, data: Partial<Book>): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'users', uid, 'books', bookId), data as Record<string, unknown>);
}

export async function getBook(uid: string, bookId: string): Promise<Book | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uid, 'books', bookId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    ...d,
    id: snap.id,
    uploadedAt: (d.uploadedAt as Timestamp)?.toDate?.() ?? new Date(),
  } as Book;
}

export async function getBooks(uid: string): Promise<Book[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users', uid, 'books'));
  return snap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
    uploadedAt: (d.data().uploadedAt as Timestamp)?.toDate?.() ?? new Date(),
  })) as Book[];
}

// ── Progress ─────────────────────────────────────────────────────────────────

export async function saveProgress(
  uid: string,
  bookId: string,
  currentPage: number,
  pageCount: number,
): Promise<void> {
  const db = getFirebaseDb();
  await setDoc(doc(db, 'users', uid, 'progress', bookId), {
    bookId,
    currentPage,
    lastReadAt: serverTimestamp(),
    percentComplete: Math.round((currentPage / pageCount) * 100),
  });
}

export async function getProgress(uid: string, bookId: string): Promise<ReadingProgress | null> {
  const db = getFirebaseDb();
  const snap = await getDoc(doc(db, 'users', uid, 'progress', bookId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    ...d,
    lastReadAt: (d.lastReadAt as Timestamp)?.toDate?.() ?? new Date(),
  } as ReadingProgress;
}

export async function getProgressForBooks(
  uid: string,
): Promise<Record<string, ReadingProgress>> {
  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users', uid, 'progress'));
  const result: Record<string, ReadingProgress> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    result[d.id] = {
      ...data,
      lastReadAt: (data.lastReadAt as Timestamp)?.toDate?.() ?? new Date(),
    } as ReadingProgress;
  });
  return result;
}

// ── Highlights ────────────────────────────────────────────────────────────────

export async function addHighlight(
  uid: string,
  data: Omit<Highlight, 'id' | 'createdAt'>,
): Promise<Highlight> {
  const db = getFirebaseDb();
  const hlRef = doc(collection(db, 'users', uid, 'highlights'));
  const highlight: Highlight = { ...data, id: hlRef.id, createdAt: new Date() };
  await setDoc(hlRef, { ...highlight, createdAt: serverTimestamp() });
  return highlight;
}

export async function getHighlightsForPage(
  uid: string,
  bookId: string,
  pageNumber: number,
): Promise<Highlight[]> {
  const db = getFirebaseDb();
  const q = query(
    collection(db, 'users', uid, 'highlights'),
    where('bookId', '==', bookId),
    where('pageNumber', '==', pageNumber),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
    color: d.data().color as HighlightColor,
    createdAt: (d.data().createdAt as Timestamp)?.toDate?.() ?? new Date(),
  })) as Highlight[];
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function uploadPdf(uid: string, bookId: string, file: File): Promise<string> {
  const storage = getFirebaseStorage();
  const path = `pdfs/${uid}/${bookId}/original.pdf`;
  await uploadBytes(ref(storage, path), file);
  return path;
}

export async function uploadExtractedText(
  uid: string,
  bookId: string,
  jsonStr: string,
): Promise<string> {
  const storage = getFirebaseStorage();
  const path = `texts/${uid}/${bookId}/pages.json`;
  await uploadString(ref(storage, path), jsonStr, 'raw');
  return path;
}

export async function getStorageDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(getFirebaseStorage(), path));
}

// Uses Firebase SDK getBytes() to avoid CORS issues with direct fetch() calls.
export async function getStorageJson<T>(path: string): Promise<T> {
  const bytes = await getBytes(ref(getFirebaseStorage(), path));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
