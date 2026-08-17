import { db } from './db';
import { kstToday, kstMonday } from './types';
import type { DailyTask, Habit, HabitLog, CalendarEvent, Initiative, KeyResult, Objective, Area } from './types';

// ── 자동 이월: 어제까지의 미완료 할일을 오늘로 옮기고 carried_over +1 ──
export async function carryOverOpenTasks(): Promise<number> {
  const today = kstToday();
  const { data, error } = await db()
    .from('daily_tasks').select('id, carried_over').lt('date', today).eq('done', false);
  if (error) throw new Error(`이월 대상 조회 실패: ${error.message}`);
  for (const t of data ?? []) {
    const { error: upErr } = await db()
      .from('daily_tasks').update({ date: today, carried_over: (t.carried_over ?? 0) + 1 }).eq('id', t.id);
    if (upErr) throw new Error(`이월 실패: ${upErr.message}`);
  }
  return (data ?? []).length;
}

// ── 규칙 기반 정렬 점수: 마감임박 > 이월누적 > 우선순위 ──
function taskScore(t: DailyTask, today: string): number {
  let score = 0;
  if (t.due_date) {
    const daysLeft = Math.round((Date.parse(t.due_date) - Date.parse(today)) / 86400_000);
    if (daysLeft <= 0) score += 100;
    else if (daysLeft <= 2) score += 60;
    else if (daysLeft <= 7) score += 30;
  }
  score += Math.min(50, t.carried_over * 12);
  if (t.source === 'initiative') score += 8;
  return score;
}

// 분기 경과율 대비 뒤처진 KR (경과율 - 진척률 > 15%p)
function laggingKRs(krs: KeyResult[], objectives: Objective[], today: string): Array<{ kr: KeyResult; objTitle: string; gap: number }> {
  const now = new Date(`${today}T12:00:00+09:00`);
  const q = Math.floor(now.getMonth() / 3);
  const qStart = new Date(now.getFullYear(), q * 3, 1).getTime();
  const qEnd = new Date(now.getFullYear(), q * 3 + 3, 1).getTime();
  const elapsed = (now.getTime() - qStart) / (qEnd - qStart);
  const out: Array<{ kr: KeyResult; objTitle: string; gap: number }> = [];
  for (const kr of krs) {
    if (kr.target_value <= 0) continue;
    const progress = kr.current_value / kr.target_value;
    const gap = elapsed - progress;
    if (gap > 0.15) {
      const obj = objectives.find((o) => o.id === kr.objective_id);
      if (obj?.status === 'active') out.push({ kr, objTitle: obj.title, gap });
    }
  }
  return out.sort((a, b) => b.gap - a.gap);
}

export type MorningBriefing = {
  date: string;
  carried: number;
  tasks: Array<{ title: string; score: number; carried_over: number; due_date: string | null; areaName: string | null }>;
  habits: Array<{ title: string }>;
  events: Array<{ time: string; title: string }>;
  lagging: Array<{ title: string; objTitle: string; pct: number }>;
  pushBody: string;
};

export async function buildMorningBriefing(): Promise<MorningBriefing> {
  const today = kstToday();
  const carried = await carryOverOpenTasks();

  const dayStart = new Date(`${today}T00:00:00+09:00`).toISOString();
  const dayEnd = new Date(`${today}T23:59:59+09:00`).toISOString();
  const [tasksQ, habitsQ, logsQ, eventsQ, krQ, objQ, areasQ, iniQ] = await Promise.all([
    db().from('daily_tasks').select('*').eq('date', today).eq('done', false),
    db().from('habits').select('*').eq('archived', false),
    db().from('habit_logs').select('*').eq('date', today),
    db().from('calendar_events').select('*').gte('starts_at', dayStart).lte('starts_at', dayEnd).order('starts_at'),
    db().from('key_results').select('*'),
    db().from('objectives').select('*'),
    db().from('areas').select('*'),
    db().from('initiatives').select('*').eq('status', 'active').eq('week_of', kstMonday()),
  ]);
  for (const r of [tasksQ, habitsQ, logsQ, eventsQ, krQ, objQ, areasQ, iniQ]) {
    if (r.error) throw new Error(`브리핑 조회 실패: ${r.error.message}`);
  }
  const tasks = (tasksQ.data as DailyTask[]).map((t) => ({ ...t, score: taskScore(t, today) }))
    .sort((a, b) => b.score - a.score);
  const areas = areasQ.data as Area[];
  const loggedHabits = new Set((logsQ.data as HabitLog[]).map((l) => l.habit_id));
  const habitsDue = (habitsQ.data as Habit[]).filter((h) => !loggedHabits.has(h.id));
  const lagging = laggingKRs(krQ.data as KeyResult[], objQ.data as Objective[], today).slice(0, 3);

  const events = (eventsQ.data as CalendarEvent[]).map((e) => ({
    time: e.all_day ? '종일' : new Date(e.starts_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }),
    title: e.title,
  }));

  // 푸시 본문: 전체 목록 (Q4 결정). 잘려도 탭하면 앱에서 전체 확인.
  const lines: string[] = [];
  if (events.length) lines.push(`📅 ${events.map((e) => `${e.time} ${e.title}`).join(' · ')}`);
  tasks.forEach((t, i) => {
    const badge = t.carried_over > 0 ? ` (이월${t.carried_over})` : t.due_date ? ` (~${t.due_date.slice(5)})` : '';
    lines.push(`${i + 1}. ${t.title}${badge}`);
  });
  if (tasks.length === 0 && (iniQ.data as Initiative[]).length > 0) {
    lines.push('오늘 할일이 비었어요 — 이번 주 이니셔티브에서 골라보세요');
  }
  if (habitsDue.length) lines.push(`🔥 습관 ${habitsDue.map((h) => h.title).join(', ')}`);
  for (const l of lagging) lines.push(`⚠️ "${l.kr.title}" 진척 ${Math.round((l.kr.current_value / l.kr.target_value) * 100)}% — 분기 페이스보다 뒤처짐`);

  return {
    date: today,
    carried,
    tasks: tasks.map((t) => ({
      title: t.title, score: t.score, carried_over: t.carried_over, due_date: t.due_date,
      areaName: areas.find((a) => a.id === t.area_id)?.name ?? null,
    })),
    habits: habitsDue.map((h) => ({ title: h.title })),
    events,
    lagging: lagging.map((l) => ({ title: l.kr.title, objTitle: l.objTitle, pct: Math.round((l.kr.current_value / l.kr.target_value) * 100) })),
    pushBody: lines.join('\n') || '오늘 계획이 비어 있어요. 앱에서 하루를 설계해보세요 ✨',
  };
}

export type EveningStatus = {
  date: string;
  openTasks: number;
  uncheckedHabits: number;
  pushBody: string;
};

export async function buildEveningStatus(): Promise<EveningStatus> {
  const today = kstToday();
  const [tasksQ, habitsQ, logsQ] = await Promise.all([
    db().from('daily_tasks').select('id').eq('date', today).eq('done', false),
    db().from('habits').select('id').eq('archived', false),
    db().from('habit_logs').select('habit_id').eq('date', today).eq('done', true),
  ]);
  for (const r of [tasksQ, habitsQ, logsQ]) if (r.error) throw new Error(`마감 조회 실패: ${r.error.message}`);
  const openTasks = tasksQ.data?.length ?? 0;
  const logged = new Set((logsQ.data ?? []).map((l: { habit_id: string }) => l.habit_id));
  const uncheckedHabits = (habitsQ.data ?? []).filter((h: { id: string }) => !logged.has(h.id)).length;
  const parts: string[] = [];
  if (openTasks) parts.push(`할일 ${openTasks}개`);
  if (uncheckedHabits) parts.push(`습관 ${uncheckedHabits}개`);
  return {
    date: today,
    openTasks,
    uncheckedHabits,
    pushBody: parts.length
      ? `아직 ${parts.join(' · ')}가 남았어요. 10초 마감하고 한 줄 회고 어때요?`
      : '오늘 전부 완료! 한 줄 회고만 남기면 끝 🌙',
  };
}
