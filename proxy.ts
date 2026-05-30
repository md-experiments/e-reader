import { NextResponse, type NextRequest } from 'next/server';

// Auth protection is handled client-side by AuthGuard.
// Firebase Auth uses localStorage/IndexedDB (not cookies), so server-side
// cookie checks would always fail and redirect authenticated users.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/library/:path*', '/upload/:path*', '/reader/:path*'],
};
