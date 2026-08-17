import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

// Google OAuth 시작점. AUTH_MODE=google + 크리덴셜 설정 후 동작.
export async function GET(req: NextRequest) {
  if (!config.google.clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID 미설정 — 내일 크리덴셜 수령 후 활성화' }, { status: 503 });
  }
  const next = req.nextUrl.searchParams.get('next') ?? '/';
  const state = crypto.randomUUID();
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.google.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/calendar');
  url.searchParams.set('access_type', 'offline'); // refresh_token 확보 (캘린더 동기화용)
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url);
  res.cookies.set('gh_oauth_state', JSON.stringify({ state, next }), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600,
  });
  return res;
}
