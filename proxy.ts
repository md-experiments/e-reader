import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/library', '/upload', '/reader'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // AuthGuard handles the primary client-side redirect.
  // This provides a fast-path redirect when there's clearly no session cookie.
  const hasSession = request.cookies.has('__session');
  if (!hasSession) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/library/:path*', '/upload/:path*', '/reader/:path*'],
};
