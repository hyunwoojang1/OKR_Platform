import { NextRequest, NextResponse } from 'next/server';
import { buildMorningBriefing } from '@/lib/briefing';
import { sendPushToAll } from '@/lib/push';
import { db } from '@/lib/db';
import { cronAuthorized } from '@/lib/cron-guard';

export const maxDuration = 60;

// 아침 7시(KST) 크론: 이월 → 브리핑 생성 → 기록 → 푸시
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 });
  try {
    const briefing = await buildMorningBriefing();
    const { error } = await db().from('briefings').upsert(
      { date: briefing.date, kind: 'morning', content: briefing, sent_at: new Date().toISOString() },
      { onConflict: 'date,kind' },
    );
    if (error) throw new Error(`브리핑 기록 실패: ${error.message}`);
    const push = await sendPushToAll({
      title: `오늘의 계획 ${briefing.date.slice(5)} ☀️`,
      body: briefing.pushBody,
      url: '/',
      tag: 'morning',
    });
    return NextResponse.json({ ok: true, carried: briefing.carried, tasks: briefing.tasks.length, push });
  } catch (e) {
    console.error('morning-briefing 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
