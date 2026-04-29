import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const isProtected = pathname.startsWith('/pollas') || pathname.startsWith('/perfil') || pathname.startsWith('/onboarding');
  const isAuthPage = pathname === '/login' || pathname.startsWith('/api/auth');

  if (!user && isProtected) {
    const redirectTo = pathname + request.nextUrl.search;
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
    redirectResponse.cookies.set('redirect_to', redirectTo, { maxAge: 300, path: '/' });
    return redirectResponse;
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/pollas', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
