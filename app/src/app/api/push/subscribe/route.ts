import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { config } from '@/lib/config';

// GET: 클라이언트가 구독에 쓸 VAPID 공개키 (세션은 proxy가 보장)
export async function GET() {
  if (!config.vapid.publicKey) return NextResponse.json({ error: 'VAPID 미설정' }, { status: 503 });
  return NextResponse.json({ publicKey: config.vapid.publicKey });
}

// POST: PushSubscription 저장 (upsert — 같은 endpoint 재구독 시 갱신)
export async function POST(req: NextRequest) {
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다' }, { status: 400 });
  }
  const { endpoint, keys } = body;
  if (!endpoint?.startsWith('https://') || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: '올바른 구독 객체가 아닙니다' }, { status: 400 });
  }
  const { error } = await db().from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
      disabled: false,
    },
    { onConflict: 'endpoint' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: 구독 해제
export async function DELETE(req: NextRequest) {
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'endpoint 필요' }, { status: 400 });
  const { error } = await db().from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
