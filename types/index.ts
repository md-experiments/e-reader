export interface TocEntry {
  title: string;
  page: number;
  level: number; // 0 = top-level chapter, 1 = section, 2 = sub-section
}

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
  toc?: TocEntry[];
  fileType?: 'pdf' | 'epub';
  thumbnailUrl?: string;
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
  toc: TocEntry[];
}
