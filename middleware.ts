import { NextResponse, type NextRequest } from 'next/server';

/** Oficina abierta: no se pide login. */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|socket.io|collab|_next/static|_next/image|favicon.ico|robots.txt).*)',
  ],
};
