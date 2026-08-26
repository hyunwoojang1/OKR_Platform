import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { signSession, sessionCookie } from '@/lib/session';
import { db } from '@/lib/db';

// Google OAuth 콜백: 코드 교환 → 이메일 화이트리스트 검증(fail-closed) → 세션 발급.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get('gh_oauth_state')?.value;

  if (!code || !state || !stateCookie) {
    return NextResponse.json({ error: 'invalid oauth flow' }, { status: 400 });
  }
  let saved: { state: string; next: string };
  try {
    saved = JSON.parse(stateCookie);
  } catch {
    return NextResponse.json({ error: 'invalid state cookie' }, { status: 400 });
  }
  if (saved.state !== state) {
    return NextResponse.json({ error: 'state mismatch' }, { status: 400 });
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'token exchange failed' }, { status: 502 });
  }
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; id_token: string };

  // id_token payload에서 이메일 추출 (구글 토큰 엔드포인트에서 직접 받았으므로 서명 재검증 불요)
  const payload = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()) as {
    email?: string; email_verified?: boolean;
  };
  const email = payload.email?.toLowerCase();
  if (!email || !payload.email_verified || email !== config.allowedEmail.toLowerCase()) {
    // 화이트리스트 외 계정: 세션 없이 거부
    return new NextResponse('이 앱은 지정된 계정만 사용할 수 있습니다.', { status: 403 });
  }

  // refresh_token은 캘린더 동기화용으로 저장 (있을 때만 갱신)
  if (tokens.refresh_token) {
    const { error } = await db().from('oauth_tokens').upsert(
      { provider: 'google', email, refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() },
      { onConflict: 'provider' },
    );
    // 로그인 자체는 성공시킨다 — 이 토큰은 달력 동기화용이라, 여기서 막으면 로그인이 통째로 실패한다.
    // 대신 조용히 넘기지는 않는다: 이게 실패하면 나중에 "달력이 왜 동기화가 안 되지"로 나타난다.
    if (error) console.error('[auth] refresh_token 저장 실패 — 달력 동기화가 안 될 수 있음:', error.message);
  }

  const session = await signSession({ email, mode: 'google', iat: Math.floor(Date.now() / 1000) }, config.sessionSecret);
  const res = NextResponse.redirect(new URL(saved.next || '/', req.nextUrl.origin));
  res.cookies.set(sessionCookie.name, session, { ...sessionCookie.options, maxAge: sessionCookie.maxAge });
  res.cookies.delete('gh_oauth_state');
  return res;
}
