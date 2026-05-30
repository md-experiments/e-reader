export interface Book {
  id: string;
  title: string;
  filename: string;
  pageCount: number;
  uploadedAt: Date;
  storagePath: string;
  textStoragePath: string;
  coverColor: string;
  tags: string[];
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

export interface PageSegment {
  type: 'h1' | 'h2' | 'h3' | 'p';
  text: string;
}

export interface PageData {
  pageNumber: number;
  text: string;
  segments?: PageSegment[];
}

export interface ExtractedBook {
  pageCount: number;
  pages: PageData[];
}
