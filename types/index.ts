export interface Book {
  id: string;
  title: string;
  filename: string;
  pageCount: number;
  uploadedAt: Date;
  storagePath: string;
  textStoragePath: string;
  coverColor: string;
}

export interface ReadingProgress {
  bookId: string;
  currentPage: number;
  lastReadAt: Date;
  percentComplete: number;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface Highlight {
  id: string;
  bookId: string;
  text: string;
  pageNumber: number;
  color: HighlightColor;
  startOffset: number;
  endOffset: number;
  createdAt: Date;
}

export interface PageData {
  pageNumber: number;
  text: string;
}

export interface ExtractedBook {
  pageCount: number;
  pages: PageData[];
}
