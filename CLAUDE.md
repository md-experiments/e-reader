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
  theme.ts                THEMES/FONTS + settings persistence, shared app-wide
  offline.ts              IndexedDB cache of extracted book text
app/manifest.ts           Web app manifest (served at /manifest.webmanifest)
public/sw.js              Service worker — app shell cache. NOT built; edit by hand
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

### The service worker is hand-written, not generated

Next's own PWA guide points at Serwist for offline support, and Serwist needs a
webpack config — which this project can't have. So `public/sw.js` is plain
JavaScript, shipped as a static file and never bundled: no imports, no
TypeScript, no build step. Keep it that way.

Three things to know when touching it:

- **Bump `VERSION`** to invalidate every cache on the next activation. Nothing
  else clears them.
- **Never cache cross-origin requests.** Firebase Auth/Firestore/Storage and the
  Hugging Face model download must reach the network; the handler returns early
  for anything not same-origin, and for `/api/*` and RSC payloads.
- **Cached responses keep their headers**, which is what lets a cache-served
  `/reader/*` page stay cross-origin isolated (and Kokoro stay multi-threaded).
  Don't rebuild a cached `Response` by hand for those routes.

### Middleware lives in proxy.ts

Next.js 16 renamed `middleware.ts` to `proxy.ts` and the export from `middleware` to `proxy`. Don't create `middleware.ts`.

## Theming

Theme and reading font are **universal for a user**, not per book: whatever was
last chosen in any book applies to every other book, to the library, and to the
upload page. Both live in `lib/theme.ts`, which is the single source of truth —
don't redefine palettes in components.

```ts
const THEMES: Record<Theme, ThemeConfig> = {
  light: { bg: '#ffffff', fg: '#111827', border: '#e5e7eb', hover: '#f3f4f6', ... },
  sepia: { ... },
  dark:  { ... },
  navy:  { bg: '#0d1b2e', fg: '#d4af6e', ... },
};
```

There are two ways to consume it, and which one you want depends on where you are:

**Inside the reader** — `const t = THEMES[theme]`, applied via `style={}` props,
not Tailwind arbitrary values (this avoids class-name generation issues with
dynamic values). New reader UI should accept `t: ThemeConfig` as a prop and do
the same. Don't hardcode colours.

**Everywhere else** — use the `lexis-*` Tailwind colour utilities:
`bg-lexis-bg`, `text-lexis-fg`, `text-lexis-muted`, `bg-lexis-panel`,
`border-lexis-border`, `hover:bg-lexis-hover`, `bg-lexis-track`,
`text-lexis-accent`, `bg-lexis-accent-bg`. They're declared in
`app/globals.css` under `@theme inline`, so each resolves its CSS custom
property at use time and the whole document re-skins with no re-render. For the
reading font use `style={{ fontFamily: 'var(--lexis-font)' }}`.

The custom properties are written onto `<html>` in two places:

1. `THEME_INIT_SCRIPT`, inlined by `app/layout.tsx` and run before first paint,
   so no page flashes the light default on a cold load.
2. `applyTheme(theme, fontFamily)`, called from a `useEffect` in `Reader` on
   every change, so a theme picked mid-book reaches the library. Pages outside
   the reader call `applyStoredTheme()` on mount to pick up a change made in
   another tab.

`ThemeConfig` carries `muted` / `panel` / `accent` / `accentBg` / `scheme`
alongside the reader's own fields. Adding a field means updating all four themes,
`cssVars()`, the `:root` light defaults in `globals.css`, and the matching
`@theme inline` entry.

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

Settings (fontSize, theme, fontFamily, the TTS preferences) are stored under the key `lexis-reader-settings` in localStorage. `loadSetting`/`saveSettings` live in `lib/theme.ts`. Use `loadSetting(key, fallback)` in a `useState` initialiser (not a `useEffect`) to avoid a flash of default values:

```ts
const [fontSize, setFontSize] = useState<number>(() => loadSetting('fontSize', 18));
```

## Working offline

Three separate mechanisms, each covering a different layer. All are needed —
none of them substitutes for another.

| Layer | Mechanism | Where |
|---|---|---|
| The app itself (HTML, JS, CSS) | Service worker, cache-first | `public/sw.js` |
| Books' text | IndexedDB, saved per book from the library | `lib/offline.ts` |
| Book list, progress, highlights | Firestore's persistent local cache | `lib/firebase.ts` |

**The shell.** `components/ServiceWorkerRegistrar.tsx` registers `public/sw.js`
after `load`, in production only — a cache-first worker in dev would serve back
yesterday's bundle. Navigations are cache-first with background revalidation, so
launching never waits on the network; a deploy is therefore picked up on the
launch *after* it lands. `/library`, `/`, `/upload` and `/offline` are precached
on install; other routes (`/reader/<id>`) are cached as they're visited, and an
uncached route offline gets `app/offline/page.tsx`.

**The books.** The library's badge on each cover (`lib/offline.ts`) stores a
book's **extracted text only** — page text/segments plus the `Book` metadata —
in IndexedDB under `lexis-offline`. The original PDF/EPUB stays in Storage, so
the PDF/EPUB view still needs a connection; the reader view doesn't. IndexedDB
rather than localStorage because a single book's `pages.json` routinely runs past
localStorage's ~5 MB origin budget.

`Reader` prefers the cached copy when one exists, and if Firestore is
unreachable it falls back to the cached `Book` metadata plus the page mirrored
in `lexis-progress-<bookId>` (written next to the Firestore progress save).
Deleting a book from the library drops its offline copy too.

**The data.** `getFirebaseDb()` uses `persistentLocalCache` rather than the
default in-memory one. The default answers offline reads too — it just starts
empty on every page load, so an offline launch would show an empty library.
Backed by IndexedDB, documents and offline writes survive a reload.

`hooks/useOnline.ts` wraps `navigator.onLine` for UI that needs to say something
about connectivity. It reports whether there's *a* network, not whether it
reaches anything — use it to phrase a message, never to gate a request.

Whatever can't be served offline must fail loudly rather than spin: the library
catches its load and falls back to the books saved on the device, and the reader
shows a "not saved to this device" screen instead of an endless spinner.

## Listening position

`useTts` owns the playhead (`indexRef`) and exposes two ways to move it without
the caller reaching inside:

- `seek(index)` — primes the position without playing and **without**
  highlighting, so restoring a saved position doesn't fight the reader's saved
  scroll position. The next `play()` picks up there.
- `setResumeFraction(f)` — where playback should land the next time the
  sentence list is replaced, as a fraction of the page. Used when switching
  between a page and its translation, whose sentence counts differ; consumed
  once, and preserved while the hook is holding for a translation to arrive.

`Reader` persists the last spoken sentence to `lexis-tts-pos-<bookId>` in
localStorage, keyed by mode (`text` | `translation`) since the two have
separate sentence lists, and restores it on load when the saved page matches
the page reading progress reopened. Firestore still owns page-level progress.

## Starting playback from a tap

`sentenceIndexAtOffset(sentences, offset)` and `offsetFromPoint(root, x, y)`
(both in `lib/tts.ts`) map a point in the rendered text to a sentence index.
`offsetFromPoint` counts characters via `Range.toString()`, so it agrees with
the highlight offset system, invisible `'\n\n'` separators included — the same
offsets the splitter produced.

Two entry points, both routed through `listenFromOffset` in `Reader`:
tapping the text while the TTS panel is open, and "Listen from here" on the
selection bar (which reuses the selection offset already computed for
highlighting). Tap-to-listen is gated on the panel being open so ordinary taps
keep dismissing panels; it works in the reader and translation views, not the
PDF/EPUB view, which has no mapped text layer.

## Listening with the screen off

Phones suspend both the speech engine and JS timers the moment the screen
locks, which silently kills playback mid-page. Two mechanisms cover it, and
both are language-agnostic (they apply equally to the Bulgarian translation
view):

1. **Screen wake lock** — `useWakeLock(active)` (`hooks/useWakeLock.ts`) holds a
   `navigator.wakeLock` screen lock while TTS status is `playing`, gated by the
   `ttsKeepAwake` setting (default on, "Screen on" toggle in the TTS panel).
   The browser drops the lock whenever the tab is hidden, so it is re-requested
   on every `visibilitychange` back to visible.
2. **Stall recovery** — a watchdog in `useTts` polls while playing and restarts
   the current sentence when playback has gone quiet for two consecutive checks
   (never while the page is hidden, so it doesn't fight a legitimately
   suspended engine). On unlock it recovers in well under a second. A sentence
   is retried at most twice before being skipped, so a phrase the engine chokes
   on can't loop forever.

`useTts` also publishes Media Session metadata + play/pause/stop handlers, so
the audio engine gets lock-screen controls.

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
| Listening dies when the phone screen turns off | OS suspends the speech engine and JS timers | Wake lock while playing + the stall watchdog in `useTts` (see "Listening with the screen off") |
| Library/upload flashes white before the dark theme appears | `THEME_INIT_SCRIPT` not reaching the document head | Keep the inline `<script>` in `app/layout.tsx` — it must run before the body renders |
| A new `lexis-*` utility class has no effect | Colour not declared in the `@theme inline` block | Add `--color-lexis-<name>: var(--lexis-<name>)` in `app/globals.css` |
| Hydration mismatch on a page that reads browser-only state | Branching on `indexedDB`/`localStorage` during render | Resolve it in a `useEffect` (see `offlineReady` in the library page) |
| Code changes don't show up in the browser | A previous build's shell is being served from the service worker cache | Hard-reload, or bump `VERSION` in `public/sw.js`; the worker is disabled in dev |
| A Firebase request is served stale or fails oddly | Something cross-origin got cached | The `fetch` handler must return early for non-same-origin URLs |
| Kokoro TTS drops to one thread | A cached `/reader/*` response lost its COOP/COEP headers | Return the cached `Response` as-is; don't reconstruct it |
