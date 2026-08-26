import webpush from 'web-push';
import { db } from './db';
import { config } from './config';

let initialized = false;
function ensureInit() {
  if (!initialized) {
    if (!config.vapid.publicKey || !config.vapid.privateKey) throw new Error('VAPID 키 미설정');
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
    initialized = true;
  }
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

// 모든 활성 구독에 발송. 410/404(만료 구독)는 비활성 처리하고 계속 진행.
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  ensureInit();
  const { data, error } = await db().from('push_subscriptions').select('*').eq('disabled', false);
  if (error) throw new Error(`구독 조회 실패: ${error.message}`);
  let sent = 0;
  let failed = 0;
  for (const sub of data ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent += 1;
      // 발송 성공 기록은 부가 정보 — 실패해도 발송 루프를 멈추지 않고 로그만 남긴다.
      const { error: okErr } = await db()
        .from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', sub.id);
      if (okErr) console.error('푸시 성공 시각 기록 실패:', okErr.message);
    } catch (e: unknown) {
      failed += 1;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        const { error: offErr } = await db()
          .from('push_subscriptions').update({ disabled: true }).eq('id', sub.id);
        if (offErr) console.error('죽은 구독 비활성화 실패:', offErr.message);
      } else {
        console.error('push 발송 실패:', status, sub.endpoint.slice(0, 60));
      }
    }
  }
  return { sent, failed };
}
