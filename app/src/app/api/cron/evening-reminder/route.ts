import { NextRequest, NextResponse } from 'next/server';
import { buildEveningStatus } from '@/lib/briefing';
import { sendPushToAll } from '@/lib/push';
import { db } from '@/lib/db';
import { cronAuthorized } from '@/lib/cron-guard';

export const maxDuration = 60;

// 저녁 9시(KST) 크론: 남은 항목 집계 → 기록 → 마감 리마인더 푸시
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 });
  try {
    const status = await buildEveningStatus();
    const { error } = await db().from('briefings').upsert(
      { date: status.date, kind: 'evening', content: status, sent_at: new Date().toISOString() },
      { onConflict: 'date,kind' },
    );
    if (error) throw new Error(`마감 기록 실패: ${error.message}`);
    const push = await sendPushToAll({
      title: '하루 마감 시간 🌙',
      body: status.pushBody,
      url: '/',
      tag: 'evening',
    });
    return NextResponse.json({ ok: true, ...status, push });
  } catch (e) {
    console.error('evening-reminder 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
