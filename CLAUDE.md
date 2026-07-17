@AGENTS.md

# Lexis — Coding Guide

## Stack & versions

- **Next.js 16.2.6** — App Router, TypeScript, Turbopack (default bundler; no webpack config)
- **React 19** — `'use client'` required on any component that uses hooks or browser APIs
- **Tailwind CSS v4** — PostCSS plugin; use utility classes for layout, `style={}` props for dynamic/theme colours
- **Firebase v12** — Auth, Firestore, Storage; all accessed through lazy getter functions in `lib/firebase.ts`
- **pdfjs-dist v5** — client-side only; always dynamically imported inside async functions

## File layout

```
app/                      Next.js App Router pages
components/               Reusable React components
lib/
  firebase.ts             Lazy Firebase init — getFirebaseAuth/Db/Storage()
  firestore.ts            All Firestore + Storage helpers
  pdfExtract.ts           PDF text + TOC extraction (pdfjs)
hooks/useAuth.tsx         AuthContext + useAuth()
types/index.ts            Shared TypeScript interfaces
proxy.ts                  Next.js 16 middleware (NOT middleware.ts — that name is deprecated)
```

## Critical rules

### Firebase must never be initialised at module level

Calling `getAuth()`, `getFirestore()`, or `getStorage()` at module evaluation time will crash the build — Next.js evaluates server components during static generation where `process.env` vars may be absent.

**Always** call the getters inside a `useEffect`, event handler, or async function:

```ts
// lib/firebase.ts exports GETTERS, not values
export function getFirebaseAuth(): Auth { ... }
export function getFirebaseDb(): Firestore { ... }
export function getFirebaseStorage(): FirebaseStorage { ... }
```

### pdfjs must be dynamically imported

```ts
// Inside an async function only — NEVER at the top of a file
const pdfjsLib = await import('pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
```

The worker file is copied to `public/` by the `postinstall` script. If pdfjs is upgraded, run `npm install` again to refresh it.

### No webpack config in next.config.ts

The project uses Turbopack. Adding a `webpack:` key causes a hard build error. Use `turbopack: {}` (empty object) if any Turbopack config is ever needed:

```ts
const nextConfig: NextConfig = {
  turbopack: {},
};
```

### Middleware lives in proxy.ts

Next.js 16 renamed `middleware.ts` to `proxy.ts` and the export from `middleware` to `proxy`. Don't create `middleware.ts`.

## Theming

Themes are defined as plain objects in `components/Reader.tsx` and applied via `style={}` props — not Tailwind arbitrary values. This avoids class-name generation issues with dynamic values.

```ts
const THEMES = {
  light: { bg: '#ffffff', fg: '#111827', border: '#e5e7eb', hover: '#f3f4f6', ... },
  sepia: { ... },
  dark:  { ... },
  navy:  { bg: '#0d1b2e', fg: '#d4af6e', ... },
};
const t = THEMES[theme];
// Usage: style={{ backgroundColor: t.bg, color: t.fg }}
```

When building new reader UI, accept `t: ThemeConfig` as a prop and apply it the same way. Don't hardcode colours.

## Firestore data shape

All collections are under `users/{uid}/`:

- `books/{bookId}` — `Book` (title, filename, pageCount, storagePath, textStoragePath, coverColor, tags, toc?)
- `progress/{bookId}` — `ReadingProgress` (currentPage, percentComplete, lastReadAt)
- `highlights/{highlightId}` — `Highlight` (bookId, pageNumber, text, startOffset, endOffset, color)

Use the helpers in `lib/firestore.ts` — don't write raw Firestore calls in components.

## Highlight offset system

Highlights store character offsets into the **flat `text` string** on `PageData`, not into the DOM. This keeps them stable across re-renders.

When rendering with segments (`renderHighlights` in `components/Highlights.tsx`):

1. Each segment's `text` is a substring of the full `text` joined by `'\n\n'`
2. Between rendered segments, an invisible `<div>` containing `'\n\n'` is injected so `Range.toString()` counts those characters
3. New highlight offsets computed by `preRange.toString().length` therefore match the stored offsets exactly

Don't change this system without updating both the renderer and the offset computation in `Reader.tsx`.

## Adding a new page/route

1. Create `app/<route>/page.tsx` with `export default function Page()`
2. Wrap the content in `<AuthGuard>` if it requires authentication
3. Add any new data operations as helper functions in `lib/firestore.ts`

## Adding a new book field

1. Add the field to `Book` in `types/index.ts`
2. Pass it in `createBook(uid, { ..., newField })` inside `UploadFlow.tsx`
3. `updateBook` already accepts `Partial<Book>`, so patching works without changes
4. Display/edit it in `app/library/page.tsx` (BookEditModal) and/or `components/Reader.tsx`

## Reader settings persistence

Settings (fontSize, theme, fontFamily) are stored under the key `lexis-reader-settings` in localStorage. Use `loadSetting(key, fallback)` in a `useState` initialiser (not a `useEffect`) to avoid a flash of default values:

```ts
const [fontSize, setFontSize] = useState<number>(() => loadSetting('fontSize', 18));
```

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `auth/invalid-api-key` during build | Firebase initialised at module level | Move into `useEffect` / event handler |
| pdfjs worker 404 | Worker not copied to `public/` | Run `npm install` (triggers postinstall) |
| Webpack/Turbopack conflict error | `webpack:` key in next.config.ts | Remove it; use `turbopack: {}` |
| Google sign-in "action invalid" | Missing OAuth redirect URI | Add `https://<project>.firebaseapp.com/__/auth/handler` to GCP credentials |
| CORS error fetching pages.json | Storage bucket CORS not configured | Apply CORS JSON via gsutil or GCP Console |
| Spaces stripped from extracted text | Items joined with `''` instead of `' '` | Always join with `' '` then normalise with `/\s+/g` |
| Safari: `undefined is not a function (near '...t of e...')` on upload | pdfjs `getTextContent` does `for await` over a ReadableStream; Safari < 18.4 can't async-iterate streams | Call `ensureReadableStreamAsyncIterator()` (lib/streamPolyfill.ts) before any pdfjs use |
| Book uploads but reader pages are blank | PDF has no text layer (scanned, or text drawn as vector outlines, e.g. "Microsoft: Print To PDF") | Expected — Reader auto-opens PDF view for such books; extraction can't recover text without OCR |
| Word spacing lost when joining lines | Lines joined without separator | Join lines within a paragraph with `' '` |
