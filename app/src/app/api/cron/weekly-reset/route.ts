import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cronAuthorized } from '@/lib/cron-guard';

export const maxDuration = 30;

// 월요일 00:00 KST (일요일 15:00 UTC) 크론: 매주 반복형 지표(cadence='weekly')의
// current_value 를 0으로 리셋한다 — "매주 30km" 같은 지표가 새 주를 0에서 시작하게.
// 지난주 실적은 session_logs 에 이미 기록으로 남아 있으므로 여기서 잃는 것은 없다.
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 });
  try {
    const { data, error } = await db()
      .from('key_results')
      .update({ current_value: 0 })
      .eq('cadence', 'weekly')
      .neq('current_value', 0)
      .select('id,title');
    if (error) throw new Error(`매주형 리셋 실패: ${error.message}`);
    const reset = (data ?? []).map((k) => k.title);
    return NextResponse.json({ ok: true, reset: reset.length, titles: reset });
  } catch (e) {
    console.error('weekly-reset 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
