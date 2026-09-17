import Link from 'next/link';

// Served by the service worker when a page is requested that has never been
// visited and the network is unreachable. Precached on install, so it is always
// there when it is needed.
export default function OfflinePage() {
  return (
    <div
      className="min-h-screen bg-lexis-bg text-lexis-fg flex flex-col items-center justify-center px-6 text-center"
      style={{ fontFamily: 'var(--lexis-font)' }}
    >
      <div className="text-5xl mb-4">📖</div>
      <h1 className="text-lg font-semibold">You&rsquo;re offline</h1>
      <p className="text-sm text-lexis-muted mt-2 max-w-xs">
        This page hasn&rsquo;t been opened on this device yet, so there&rsquo;s no copy to fall back
        on. Books you saved for offline reading are still available.
      </p>
      <Link
        href="/library"
        className="mt-6 px-5 py-2.5 bg-lexis-fg text-lexis-bg text-sm rounded-lg hover:opacity-80 transition-opacity"
      >
        Go to your library
      </Link>
    </div>
  );
}
