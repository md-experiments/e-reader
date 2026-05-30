# Lexis — E-Reader

A Kindle-style web e-reader. Upload PDFs or EPUBs, read them as clean paginated text, highlight passages, navigate by table of contents, and pick up exactly where you left off — on any device.

---

## Features

- **PDF & EPUB upload** — drag-and-drop or browse; accepts `.pdf` and `.epub` files; text is extracted chapter-by-chapter (EPUB) or page-by-page (PDF) on the client, preserving paragraph breaks and heading hierarchy
- **Library** — book grid with cover colours, reading-progress bars, and last-read dates
- **Reader** — paginated text view with Prev/Next navigation and keyboard arrow support
- **Typography controls** — font size (12–32 px), four themes (Light / Sepia / Dark / Navy), five typefaces (Georgia, Merriweather, Lora, Source Serif 4, Sans); all settings persist via localStorage
- **Original-page preview** — toggle between extracted text and the original: PDFs render via pdfjs canvas; EPUBs render each chapter's HTML in a sandboxed iframe with images and CSS intact
- **Highlights** — select any text to get a colour-picker (yellow / green / blue / pink); highlights are stored in Firestore per page and survive theme/font changes via character-offset indexing
- **Table of contents** — extracted automatically (PDF bookmark outline; EPUB NCX or nav.xhtml); editable after the fact (add, rename, re-page, indent entries); tapping any entry jumps to that page with the active chapter highlighted in the sidebar
- **Tags** — add free-form tags to books; filter the library by tag
- **Book management** — rename books, edit tags, delete (removes Firestore records and Storage files)
- **Multi-user** — each user has a completely isolated library; all Firestore and Storage paths are scoped to `users/{uid}/`
- **Auth** — email/password and Google OAuth via Firebase Auth

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Styling | Tailwind CSS v4 |
| Auth / DB | Firebase v12 — Auth, Firestore, Storage |
| PDF processing | pdfjs-dist v5 (client-side only, dynamic import) |
| EPUB processing | jszip v3 + browser DOMParser (client-side only, dynamic import) |
| Deployment | Vercel |

---

## Project Structure

```
app/
  page.tsx                  # Landing page + sign-in / sign-up
  library/page.tsx          # Authenticated book grid
  upload/page.tsx           # Upload page
  reader/[bookId]/page.tsx  # Reader page

components/
  AuthGuard.tsx             # Client-side route protection
  UploadFlow.tsx            # Dropzone → extraction → Firestore save (PDF + EPUB)
  Reader.tsx                # Full reading UI (text, nav, themes, highlights)
  PdfViewer.tsx             # pdfjs canvas renderer for original PDF pages
  EpubViewer.tsx            # EPUB chapter HTML renderer (sandboxed iframe)
  TocSidebar.tsx            # Table of contents panel (view + edit modes)
  Highlights.tsx            # Highlight rendering (character-offset based)
  TagInput.tsx              # Reusable tag input with autocomplete

lib/
  firebase.ts               # Lazy Firebase initialisation (SSR-safe)
  firestore.ts              # All Firestore + Storage helpers
  pdfExtract.ts             # PDF text + TOC extraction
  epubExtract.ts            # EPUB text + TOC extraction (jszip + DOMParser)

hooks/
  useAuth.tsx               # AuthContext + useAuth hook

types/
  index.ts                  # Shared TypeScript types

proxy.ts                    # Next.js 16 middleware (replaces middleware.ts)
```

---

## Data Model

All Firestore collections are nested under `users/{uid}/` so a single security rule covers everything:

```
allow read, write: if request.auth.uid == userId;
```

**`users/{uid}/books/{bookId}`**
```ts
{
  id, title, filename, pageCount,
  uploadedAt,          // Firestore Timestamp
  storagePath,         // pdfs/{uid}/{bookId}/original.pdf  OR  epubs/{uid}/{bookId}/original.epub
  textStoragePath,     // texts/{uid}/{bookId}/pages.json
  coverColor,          // hex string
  tags,                // string[]
  toc?,                // TocEntry[] — { title, page, level }[]
  fileType?,           // 'pdf' | 'epub'  (undefined = legacy PDF)
}
```

**`users/{uid}/progress/{bookId}`**
```ts
{ bookId, currentPage, lastReadAt, percentComplete }
```

**`users/{uid}/highlights/{highlightId}`**
```ts
{ id, bookId, text, pageNumber, color, startOffset, endOffset, createdAt }
```

**Firebase Storage**
```
pdfs/{uid}/{bookId}/original.pdf
epubs/{uid}/{bookId}/original.epub
texts/{uid}/{bookId}/pages.json     ← ExtractedBook JSON (same format for both PDF and EPUB)
```

The extracted text JSON (`pages.json`) stores both a flat `text` string (used for highlight offset computation) and structured `segments` (used for semantic HTML rendering).

---

## Local Development

### Prerequisites

- Node.js 18+
- A Firebase project with **Authentication** (Email/Password + Google), **Firestore**, and **Storage** enabled
- No native dependencies — EPUB parsing runs entirely in the browser via `jszip` and the native `DOMParser`

### 1. Clone and install

```bash
git clone <repo-url>
cd e-reader
npm install
```

The `postinstall` script automatically copies the pdfjs worker to `public/`:

```
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

All values come from your Firebase project's **Project Settings → General → Your apps → SDK setup**.

### 3. Firebase configuration

**Firestore rules** (`firestore.rules`):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Storage rules** (`storage.rules`):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /pdfs/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /epubs/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /texts/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Storage CORS** — required so the browser can fetch files via the Firebase SDK. Apply with `gsutil` or the Google Cloud Console:

```json
[{
  "origin": ["*"],
  "method": ["GET", "HEAD"],
  "responseHeader": ["Content-Type", "Authorization"],
  "maxAgeSeconds": 3600
}]
```

**Google OAuth** — in [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth client, add this to Authorised redirect URIs:
```
https://<YOUR_PROJECT_ID>.firebaseapp.com/__/auth/handler
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add all six `NEXT_PUBLIC_FIREBASE_*` environment variables in **Project Settings → Environment Variables**
4. Deploy — Vercel auto-detects Next.js and runs `npm run build`

Add your production domain to Firebase Auth → **Authorised domains** and to the Google OAuth client's redirect URIs.

---

## How It Works

### PDF extraction pipeline

1. User drops a PDF → `UploadFlow` calls `extractPdfPages(file)` in `lib/pdfExtract.ts`
2. pdfjs is **dynamically imported** (never at module level — prevents SSR crashes)
3. For each page, text items are grouped by Y-position into lines, then into paragraphs by detecting gaps larger than 1.5× the median line height
4. Font sizes are compared to the page median to classify paragraphs as `h1 / h2 / h3 / p`
5. Each page produces `{ text, segments }` — `text` is the flat string used for highlight offsets; `segments` are the structured blocks rendered as semantic HTML
6. `getOutline()` extracts the PDF's bookmark tree; each entry's destination is resolved to a page number and flattened into `TocEntry[]`
7. The resulting JSON is uploaded to Firebase Storage; metadata (including TOC) goes to Firestore

### EPUB extraction pipeline

1. User drops an EPUB → `UploadFlow` calls `extractEpubPages(file)` in `lib/epubExtract.ts`
2. `jszip` is **dynamically imported**; the EPUB (a ZIP archive) is unzipped entirely in the browser
3. `META-INF/container.xml` → OPF manifest path; the OPF is parsed for the spine (chapter order) and TOC file location
4. TOC is read from NCX (`navPoint` tree, EPUB 2) or `nav.xhtml` (`<nav epub:type="toc">`, EPUB 3); each entry's href is mapped to its 1-based spine index
5. Each spine item's HTML is parsed with the browser's `DOMParser`; block elements (`h1–h6`, `p`, `blockquote`, `li`) are mapped to `PageSegment[]` — one "page" per chapter
6. Same output format as PDF: `ExtractedBook { pageCount, pages, toc }` — all downstream code (highlights, TOC sidebar, reader) is format-agnostic
7. Original EPUB stored at `epubs/{uid}/{bookId}/original.epub`; extracted JSON at `texts/{uid}/{bookId}/pages.json`

### EPUB HTML preview

When the **HTML** toggle is active for an EPUB book, `EpubViewer` downloads the original EPUB from Firebase Storage, unzips it with jszip, and renders the current chapter's HTML in a `sandbox="allow-same-origin"` iframe. Before rendering, relative asset hrefs (images, stylesheets, fonts) are rewritten to `blob:` URLs created from the zip entries — this makes the chapter render correctly without any server and without CORS issues. Blob URLs are revoked when navigating to another chapter or unmounting.

### Highlight system

Highlights are stored as character offsets into the flat `text` string, not DOM ranges. This makes them stable across re-renders caused by theme/font changes. When rendering, each segment's local offset range is computed from the global offset, and invisible zero-height `<div>` nodes containing `\n\n` are injected between segments so that `Range.toString()` counts those characters when computing offsets for new highlights — keeping the coordinate systems consistent.

### Firebase lazy initialisation

`lib/firebase.ts` exports getter functions (`getFirebaseAuth()`, `getFirebaseDb()`, `getFirebaseStorage()`) instead of values. The Firebase SDK functions are statically imported (safe at module load time) but `initializeApp` / `getAuth` / etc. are only called the first time each getter is invoked — always from inside a `useEffect` or event handler, never during SSR.
