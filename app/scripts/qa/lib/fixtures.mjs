import { db, TAG } from './db.mjs';
import { assertTagged } from './guard.mjs';

/** 한국 시간 기준 오늘. 앱의 kstToday() 와 같은 계산. */
export function kstToday(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

/**
 * 가짜 행 하나. 태그가 없으면 만들지 않는다(S5).
 * created 에 기록해 두면 하네스가 끝날 때 만든 역순으로 지운다.
 */
let seq = 0;
/** 한 실행 안에서 픽스처끼리 이름이 겹치지 않게. areas.name 처럼 unique 제약이 걸린 칸이 있다. */
export function uniq(label) {
  seq += 1;
  return `${TAG}${label}${seq}`;
}

async function mk(created, table, row) {
  assertTagged(row);
  const { data, error } = await db.from(table).insert(row).select().single();
  if (error) throw new Error(`${table} 픽스처 생성 실패: ${error.message}`);
  created.push({ table, id: data.id });
  return data;
}

/**
 * 목표 한 줄짜리 세트 — 영역·목표·지표.
 * 실제 영역/목표에 붙이지 않는 이유: 진짜 지표 숫자를 건드리면 복구가 어려워진다.
 */
export async function makeGoal(created, { krTitle = '지표', target = 10, source = 'manual', showDaily = false } = {}) {
  const area = await mk(created, 'areas', { name: uniq('영역'), color: '#8A8A8A', sort_order: 99 });
  const objective = await mk(created, 'objectives', {
    area_id: area.id, title: uniq('목표'), period: kstToday().slice(0, 4) + '-Q3', status: 'active',
  });
  const kr = await mk(created, 'key_results', {
    objective_id: objective.id, title: uniq(krTitle), target_value: target,
    current_value: 0, unit: '건', source, show_daily: showDaily,
  });
  return { area, objective, kr };
}

/** 달력 마감 하나. 기본은 오늘, 마감으로 확정(제목 규칙에 안 기대게). */
export async function makeDeadline(created, { dayOffset = 0, krId = null, title = '마감' } = {}) {
  const day = kstToday(dayOffset);
  return mk(created, 'calendar_events', {
    title: `${TAG} ${title}`,
    starts_at: `${day}T05:00:00Z`,
    all_day: false,
    source: 'app',
    sync_status: 'local',
    pinned: false,
    is_deadline: true,
    key_result_id: krId,
  });
}

/** 오늘 할일 하나. */
export async function makeTask(created, { done = false, areaId = null } = {}) {
  return mk(created, 'daily_tasks', {
    title: `${TAG} 할일`, date: kstToday(), done, area_id: areaId,
  });
}

/** 루틴 하나. */
export async function makeHabit(created, { areaId = null } = {}) {
  return mk(created, 'habits', {
    title: `${TAG} 루틴`, area_id: areaId, cadence: 'daily', target_per_week: 7,
  });
}

export { mk };
