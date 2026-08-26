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
const AUTO_TAG = '(건강앱 자동)';

// Supabase가 간헐적으로 'JWT issued at future'(노드 시계 오차)를 뱉는다 — 자동 기록이
// 그것 때문에 통째로 유실되면 안 되므로 짧게 재시도한다.
async function withRetry<T>(
  label: string,
  fn: () => PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  let lastMsg = '';
  for (let i = 0; i < 3; i++) {
    const r = await fn();
    if (!r.error) return r.data;
    lastMsg = r.error.message;
    if (i < 2) await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw new Error(`${label} 실패: ${lastMsg}`);
}

// 폰 단축어용 전용 키: 크론 마스터 시크릿을 폰에 심지 않기 위해 분리한다(권한도 이 라우트 한정).
function ingestAuthorized(req: NextRequest): boolean {
  const token = process.env.INGEST_TOKEN;
  if (!token) return false;
  if (req.headers.get('authorization') === `Bearer ${token}`) return true;
  return req.nextUrl.searchParams.get('key') === token;
}

export async function POST(req: NextRequest) {
  if (!ingestAuthorized(req) && !cronAuthorized(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  // 단축어는 JSON을 보낸다: { "km": 5.2, "minutes": 31 } (minutes 선택)
  let body: { km?: unknown; minutes?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요해요 (예: {"km": 5.2})' }, { status: 400 });
  }
  const km = Math.round(Number(body.km) * 100) / 100;
  const minutes = Number(body.minutes);
  // 안 뛴 날에도 자동화는 돈다 — 빈 값/0은 에러가 아니라 "할 일 없음"으로 조용히 넘긴다.
  if (!Number.isFinite(km) || km <= 0) {
    return NextResponse.json({ ok: true, skipped: '오늘 러닝 기록 없음' });
  }
  if (km > MAX_KM) {
    return NextResponse.json({ error: `km 값이 이상해요: ${String(body.km)}` }, { status: 400 });
  }
  const min = Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_MIN ? Math.round(minutes) : null;

  try {
    const today = kstToday();
    const dayStart = new Date(`${today}T00:00:00+09:00`).toISOString();
    const dayEnd = new Date(new Date(dayStart).getTime() + 86400_000).toISOString();

    const [objRows, krRows, areaRows, prevRows] = await Promise.all([
      withRetry('목표 조회', () => db().from('objectives').select('id,title,status').eq('status', 'active')),
      withRetry('지표 조회', () => db().from('key_results').select('*')),
      withRetry('영역 조회', () => db().from('areas').select('id,name').eq('archived', false)),
      // 오늘 이미 자동 기록된 값 — 단축어는 "오늘 하루 합계"를 보내므로 차이만 반영한다(중복 누적 방지)
      withRetry('기존 기록 조회', () =>
        db().from('session_logs').select('id,metrics')
          .like('note', `%${AUTO_TAG}`).gte('logged_at', dayStart).lt('logged_at', dayEnd)
          .order('logged_at', { ascending: false }).limit(1),
      ),
    ]);
    const activeIds = new Set((objRows as Pick<Objective, 'id' | 'title' | 'status'>[]).map((o) => o.id));
    const krs = (krRows as KeyResult[]).filter((k) => activeIds.has(k.objective_id));
    const exerciseArea = (areaRows as { id: string; name: string }[]).find((a) => /운동|헬스|러닝/.test(a.name)) ?? null;

    const prevLog = (prevRows as { id: string; metrics: { v: number; u: string }[] | null }[])[0] ?? null;
    const prevKm = prevLog?.metrics?.find((m) => m.u === 'km')?.v ?? 0;
    // 보낸 값이 오늘 누적 합계라는 전제 — 이미 반영된 만큼은 빼고 차이만 더한다.
    const deltaKm = Math.round((km - prevKm) * 100) / 100;
    const firstToday = prevLog === null;

    // ── ② 러닝 지표 자동 반영 (증분만) ──
    // 거리형: 이름에 러닝 계열 + 단위 km → +차이. 횟수형: 오늘 첫 기록일 때만 +1.
    const updated: string[] = [];
    if (deltaKm > 0) {
      for (const kr of krs) {
        if (!RUN_WORDS.test(kr.title)) continue;
        const unit = (kr.unit ?? '').toLowerCase();
        let delta = 0;
        if (unit.includes('km')) delta = deltaKm;
        else if ((unit === '회' || unit === '번') && firstToday) delta = 1;
        else continue;
        const next = Math.round((Number(kr.current_value) + delta) * 100) / 100;
        const { error } = await db().from('key_results').update({ current_value: next }).eq('id', kr.id);
        if (!error) updated.push(`${kr.title} ${kr.current_value}→${next}${kr.unit}`);
      }
    }

    // 로그를 어느 목표 타임라인에 붙일지: 방금 갱신된 지표의 목표 우선
    const firstUpdatedKr = krs.find((k) => updated.some((u) => u.startsWith(k.title)));
    const objectiveId = firstUpdatedKr?.objective_id ?? null;

    // ── ① 세션 로그 (하루 한 줄 — 다시 보내면 그 줄을 최신 합계로 갱신) ──
    const note = `러닝 ${km}km${min ? ` · ${min}분` : ''} 🏃 ${AUTO_TAG}`;
    const metrics = [{ v: km, u: 'km' }, ...(min ? [{ v: min, u: '분' }] : [])];
    if (prevLog) {
      const { error } = await db().from('session_logs').update({ note, metrics }).eq('id', prevLog.id);
      if (error) throw new Error(`로그 갱신 실패: ${error.message}`);
    } else {
      const { error } = await db().from('session_logs').insert({
        objective_id: objectiveId,
        area_id: exerciseArea?.id ?? null,
        kind: 'log',
        note,
        metrics,
      });
      if (error) throw new Error(`로그 저장 실패: ${error.message}`);
    }

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

    return NextResponse.json({
      ok: true, km, addedKm: deltaKm > 0 ? deltaKm : 0, minutes: min,
      updatedKrs: updated, taskDone, habitChecked,
      note: deltaKm > 0 ? undefined : '이미 반영된 거리 — 중복 누적 없음',
    });
  } catch (e) {
    console.error('ingest/run 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
