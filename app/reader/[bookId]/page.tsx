import AuthGuard from '@/components/AuthGuard';
import Reader from '@/components/Reader';

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  return (
    <AuthGuard>
      <Reader bookId={bookId} />
    </AuthGuard>
  );
}
