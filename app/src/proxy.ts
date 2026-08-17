import { NextRequest, NextResponse } from 'next/server';
import { verifySession, signSession, sessionCookie } from '@/lib/session';

// 공개 경로: 인증·PWA 자산·크론(자체 시크릿 검증)만. 나머지는 전부 세션 필요.
const PUBLIC_PREFIXES = ['/api/auth/', '/api/cron/', '/_next/', '/icons/'];
const PUBLIC_EXACT = ['/manifest.webmanifest', '/sw.js', '/favicon.ico', '/login'];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // 시크릿 미설정 = 전면 차단 (fail-closed)
    return new NextResponse('server misconfigured', { status: 503 });
  }

  const token = req.cookies.get(sessionCookie.name)?.value;
  const session = await verifySession(token, secret);
  if (session) return NextResponse.next();

  // dev 모드: 우회 세션을 즉석 발급 (내일 AUTH_MODE=google 전환 시 이 분기가 사라짐)
  if ((process.env.AUTH_MODE ?? 'dev') === 'dev') {
    const devToken = await signSession(
      { email: process.env.ALLOWED_EMAIL ?? 'hyunwoojang99@gmail.com', mode: 'dev', iat: Math.floor(Date.now() / 1000) },
      secret,
    );
    const res = NextResponse.next();
    res.cookies.set(sessionCookie.name, devToken, { ...sessionCookie.options, maxAge: sessionCookie.maxAge });
    return res;
  }

  // google 모드: 미인증 → 로그인으로
  if (pathname.startsWith('/api/')) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
