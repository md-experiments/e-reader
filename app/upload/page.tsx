import AuthGuard from '@/components/AuthGuard';
import UploadFlow from '@/components/UploadFlow';
import Link from 'next/link';

export default function UploadPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-lexis-bg text-lexis-fg" style={{ fontFamily: 'var(--lexis-font)' }}>
        <header className="bg-lexis-panel border-b border-lexis-border px-6 py-4 flex items-center gap-4">
          <Link href="/library" className="text-sm text-lexis-muted hover:text-lexis-fg transition-colors">
            ← Library
          </Link>
          <h1 className="text-sm font-semibold">Add a book</h1>
        </header>
        <main className="px-6 py-12">
          <UploadFlow />
        </main>
      </div>
    </AuthGuard>
  );
}
