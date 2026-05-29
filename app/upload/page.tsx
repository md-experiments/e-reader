import AuthGuard from '@/components/AuthGuard';
import UploadFlow from '@/components/UploadFlow';
import Link from 'next/link';

export default function UploadPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
          <Link href="/library" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
            ← Library
          </Link>
          <h1 className="text-sm font-semibold text-gray-900">Add a book</h1>
        </header>
        <main className="px-6 py-12">
          <UploadFlow />
        </main>
      </div>
    </AuthGuard>
  );
}
