import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cronAuthorized } from '@/lib/cron-guard';
import type { KeyResult, Objective } from '@/lib/types';
import { kstToday } from '@/lib/types';

export const maxDuration = 30;

// 러닝 자동 기록: 아이폰 단축어(나이키→애플건강→여기)가 POST 한다.
// 하는 일: ① 세션 로그 한 줄 ② 러닝 지표(KR) 자동 누적 ③ 오늘 할일 '러닝' 자동 체크 ④ 러닝 습관 체크.
// 인증은 크론과 같은 시크릿(?secret= 또는 Bearer) — 개인 도구라 별도 키를 늘리지 않는다.
const RUN_WORDS = /러닝|달리기|조깅|run|뛰/i;
const MAX_KM = 200;
const MAX_MIN = 24 * 60;

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 });

  // 단축어는 JSON을 보낸다: { "km": 5.2, "minutes": 31 } (minutes 선택)
  let body: { km?: unknown; minutes?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요해요 (예: {"km": 5.2})' }, { status: 400 });
  }
  const km = Math.round(Number(body.km) * 100) / 100;
  const minutes = Number(body.minutes);
  if (!Number.isFinite(km) || km <= 0 || km > MAX_KM) {
    return NextResponse.json({ error: `km 값이 이상해요: ${String(body.km)}` }, { status: 400 });
  }
  const min = Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_MIN ? Math.round(minutes) : null;

  try {
    const today = kstToday();
    const [objQ, krQ, areaQ] = await Promise.all([
      db().from('objectives').select('id,title,status').eq('status', 'active'),
      db().from('key_results').select('*'),
      db().from('areas').select('id,name').eq('archived', false),
    ]);
    for (const q of [objQ, krQ, areaQ]) {
      if (q.error) throw new Error(`조회 실패: ${q.error.message}`);
    }
    const activeIds = new Set((objQ.data as Pick<Objective, 'id' | 'title' | 'status'>[]).map((o) => o.id));
    const krs = (krQ.data as KeyResult[]).filter((k) => activeIds.has(k.objective_id));
    const exerciseArea = (areaQ.data as { id: string; name: string }[]).find((a) => /운동|헬스|러닝/.test(a.name)) ?? null;

    // ── ② 러닝 지표 자동 누적 ──
    // 거리형: 이름에 러닝 계열 + 단위 km → +뛴 km. 횟수형: 러닝 계열 + 단위 회 → +1.
    const updated: string[] = [];
    for (const kr of krs) {
      if (!RUN_WORDS.test(kr.title)) continue;
      const unit = (kr.unit ?? '').toLowerCase();
      let delta = 0;
      if (unit.includes('km')) delta = km;
      else if (unit === '회' || unit === '번') delta = 1;
      else continue;
      const next = Math.round((Number(kr.current_value) + delta) * 100) / 100;
      const { error } = await db().from('key_results').update({ current_value: next }).eq('id', kr.id);
      if (!error) updated.push(`${kr.title} ${kr.current_value}→${next}${kr.unit}`);
    }

    // 로그를 어느 목표 타임라인에 붙일지: 방금 갱신된 지표의 목표 우선
    const firstUpdatedKr = krs.find((k) => updated.some((u) => u.startsWith(k.title)));
    const objectiveId = firstUpdatedKr?.objective_id ?? null;

    // ── ① 세션 로그 ──
    const note = `러닝 ${km}km${min ? ` · ${min}분` : ''} 🏃 (건강앱 자동)`;
    const metrics = [{ v: km, u: 'km' }, ...(min ? [{ v: min, u: '분' }] : [])];
    const { error: logErr } = await db().from('session_logs').insert({
      objective_id: objectiveId,
      area_id: exerciseArea?.id ?? null,
      kind: 'log',
      note,
      metrics,
    });
    if (logErr) throw new Error(`로그 저장 실패: ${logErr.message}`);

    // ── ③ 오늘 할일 '러닝' 자동 체크 (열려 있는 것만, 중복 로그는 안 남긴다) ──
    let taskDone: string | null = null;
    const { data: tasks } = await db().from('daily_tasks').select('id,title').eq('date', today).eq('done', false);
    const runTask = (tasks ?? []).find((t) => RUN_WORDS.test(t.title));
    if (runTask) {
      const { error } = await db()
        .from('daily_tasks')
        .update({ done: true, done_at: new Date().toISOString() })
        .eq('id', runTask.id);
      if (!error) taskDone = runTask.title;
    }

    // ── ④ 러닝 습관 자동 체크 ──
    let habitChecked: string | null = null;
    const { data: habits } = await db().from('habits').select('id,title').eq('archived', false);
    const runHabit = (habits ?? []).find((h) => RUN_WORDS.test(h.title));
    if (runHabit) {
      const { error } = await db()
        .from('habit_logs')
        .upsert({ habit_id: runHabit.id, date: today, done: true }, { onConflict: 'habit_id,date' });
      if (!error) habitChecked = runHabit.title;
    }

    return NextResponse.json({ ok: true, km, minutes: min, updatedKrs: updated, taskDone, habitChecked });
  } catch (e) {
    console.error('ingest/run 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
