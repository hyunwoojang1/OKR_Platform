import { chromium } from 'file:///C:/Users/notebiz765/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { beginHarness, endHarness, created } from './lib/guard.mjs';
import { db, TAG, rowCount } from './lib/db.mjs';
import { makeGoal, makeDeadline, makeHabit, makeTask, mk, kstToday, uniq } from './lib/fixtures.mjs';
import { env } from './lib/env.mjs';

/**
 * 카오스 QA — 진짜 데이터를 잔뜩 넣었다가 만지고 지운다.
 *
 * 검사 하나하나를 따로 도는 것과 다른 점: 여러 종류가 뒤섞인 상태에서 조작하고,
 * 그 뒤에도 **불변식이 깨지지 않았는지**를 본다. 한 가지만 두고 볼 때는 안 나오고
 * 여러 개가 얽혔을 때만 나오는 어긋남이 있기 때문이다.
 *
 * 끝나면 만든 것을 전부 지우고 시작 스냅샷과 행 단위로 대조한다.
 * 차이가 하나라도 남으면 실패다 — 찌꺼기를 남기는 검사는 다음 검사를 오염시킨다.
 */

const ROUNDS = Number(process.env.QA_ROUNDS ?? 5);
const BASE = env.baseUrl;
const today = kstToday();
const CAL = `${BASE}/calendar?m=${today.slice(0, 7)}&d=${today}`;

const num = (v) => Number(v ?? 0);
const sel = async (t, f) => { const { data, error } = await f(db.from(t).select('*')); if (error) throw new Error(`${t}: ${error.message}`); return data ?? []; };

/** 태그된 데이터에 대해 항상 참이어야 하는 것들. 라운드마다 확인한다. */
async function invariants() {
  const bad = [];

  // ① 마감에서 온 할일은 그 일정을 가리켜야 한다 (유령 할일 금지)
  const tasks = await sel('daily_tasks', (b) => b.eq('source', 'job_posting').not('source_ref', 'is', null));
  const evIds = new Set((await sel('calendar_events', (b) => b)).map((e) => e.id));
  for (const t of tasks) if (!evIds.has(t.source_ref)) bad.push(`유령 할일: ${String(t.title).slice(0, 30)} → 없는 일정 ${String(t.source_ref).slice(0, 8)}`);

  // ② 지표 = 그 지표에 달린 기록의 합 (숫자와 기록이 서로 다른 말을 하면 안 된다)
  const krs = (await sel('key_results', (b) => b)).filter((k) => String(k.title).includes(TAG));
  const logs = await sel('session_logs', (b) => b.not('key_result_id', 'is', null));
  for (const k of krs) {
    const mine = logs.filter((l) => l.key_result_id === k.id);
    const sum = mine.reduce((s, l) => s + num(l.metrics?.[0]?.v ?? (l.metrics === null ? num(k.step) : 0)), 0);
    const expect = Math.round((num(k.start_value) + sum) * 100) / 100;
    if (Math.abs(num(k.current_value) - expect) > 0.001) {
      bad.push(`지표≠기록: ${String(k.title).slice(0, 24)} 값 ${k.current_value} vs 기록합 ${expect} (기록 ${mine.length}건)`);
    }
  }

  // ③ 기록이 없는 할일/일정을 가리키지 않는다
  const taskIds = new Set((await sel('daily_tasks', (b) => b)).map((t) => t.id));
  for (const l of await sel('session_logs', (b) => b.not('task_id', 'is', null))) {
    if (!taskIds.has(l.task_id)) bad.push(`끊긴 기록: task_id ${String(l.task_id).slice(0, 8)} 없음`);
  }

  // ④ done 과 done_at 이 같은 말을 한다
  for (const t of await sel('daily_tasks', (b) => b)) {
    if (t.done && !t.done_at) bad.push(`완료인데 시각 없음: ${String(t.title).slice(0, 24)}`);
    if (!t.done && t.done_at) bad.push(`미완료인데 시각 있음: ${String(t.title).slice(0, 24)}`);
  }

  // ⑤ 지표 값이 음수가 아니다
  for (const k of krs) if (num(k.current_value) < 0) bad.push(`지표 음수: ${String(k.title).slice(0, 24)} = ${k.current_value}`);

  return bad;
}

const press = async (page, url, name, wait = 1400) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  const b = page.getByRole('button', { name }).first();
  if (await b.count() === 0) return false;
  await b.click();
  await page.waitForTimeout(wait);
  return true;
};

async function round(page) {
  const acts = [];
  const log = (s) => acts.push(s);

  // ── 넣는다: 종류를 섞어서 ──
  const { area, objective, kr } = await makeGoal(created, { krTitle: '제출', target: 12, showDaily: true });
  const dayOf = (off) => new Date(Date.now() + 9 * 3600_000 + off * 86400_000).toISOString().slice(0, 10);
  const calOn = (off) => `${BASE}/calendar?m=${dayOf(off).slice(0, 7)}&d=${dayOf(off)}`;
  const krNum = await mk(created, 'key_results', {
    objective_id: objective.id, title: uniq('숫자지표'), target_value: 50, current_value: 0,
    unit: 'km', source: 'manual', input_mode: 'number', show_daily: true, cadence: 'weekly',
  });
  const krText = await mk(created, 'key_results', {
    objective_id: objective.id, title: uniq('내용지표'), target_value: null, current_value: 0,
    unit: '', source: 'manual', input_mode: 'text', show_daily: true,
  });
  const habit = await makeHabit(created, { areaId: area.id });
  const task = await makeTask(created, { areaId: area.id });
  const ini = await mk(created, 'initiatives', {
    objective_id: objective.id, area_id: area.id, title: uniq('주간'), week_of: kstMonday(), status: 'active',
  });
  const evA = await makeDeadline(created, { krId: kr.id, title: uniq('마감A') });
  const evB = await makeDeadline(created, { dayOffset: 2, title: uniq('마감B') });
  const evPast = await makeDeadline(created, { dayOffset: -3, title: uniq('지난마감') });
  const season = await mk(created, 'seasons', { name: uniq('시즌'), keywords: ['마감A'], sort_order: 90 });
  log(`픽스처 ${created.length}건`);

  // ── 만진다 ──
  if (await press(page, CAL, new RegExp(`${evA.title} 다 했음`))) log('마감A 완료');
  if (await press(page, CAL, new RegExp(`${evA.title} 완료 되돌리기`))) log('마감A 되돌리기');
  if (await press(page, CAL, new RegExp(`${evA.title} 다 했음`))) log('마감A 다시 완료');
  if (await press(page, calOn(2), new RegExp(`${evB.title} 다 했음`))) log('마감B 완료');
  if (await press(page, calOn(2), new RegExp(`${evB.title} D-day`))) log('마감B 핀');

  if (await press(page, `${BASE}/`, new RegExp(`${task.title} 완료`))) log('할일 체크');
  if (await press(page, `${BASE}/`, new RegExp(`${task.title} 되돌리기`))) log('할일 해제');
  if (await press(page, `${BASE}/`, new RegExp(`${habit.title} 오늘 했음`))) log('루틴 체크');
  if (await press(page, `${BASE}/`, new RegExp(`${kr.title} 오늘 한 번 더`))) log('지표 +1');
  if (await press(page, `${BASE}/`, new RegExp(`${kr.title} 오늘 한 번 더`))) log('지표 +1 또');

  // 숫자형 기록 (칸을 열고 입력)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const open = page.getByRole('button', { name: new RegExp(`${krNum.title} 오늘 기록하기`) }).first();
  if (await open.count()) {
    await open.click(); await page.waitForTimeout(300);
    const inp = page.locator('input[name="amount"]').first();
    if (await inp.count()) { await inp.fill('7.5'); await page.getByRole('button', { name: new RegExp(`${krNum.title} 기록 저장`) }).first().click(); await page.waitForTimeout(1400); log('숫자지표 7.5 기록'); }
  }
  // 내용형 기록
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const open2 = page.getByRole('button', { name: new RegExp(`${krText.title} 오늘 기록하기`) }).first();
  if (await open2.count()) {
    await open2.click(); await page.waitForTimeout(300);
    const inp2 = page.locator('input[name="note"]').first();
    if (await inp2.count()) { await inp2.fill(`${TAG} 우리자산운용`); await page.getByRole('button', { name: new RegExp(`${krText.title} 기록 저장`) }).first().click(); await page.waitForTimeout(1400); log('내용지표 기록'); }
  }
  // 기록 되돌리기
  if (await press(page, `${BASE}/`, /되돌리기/)) log('방금 기록 되돌리기');

  // 주간 계획 체크/해제
  if (await press(page, `${BASE}/okr/${objective.id}`, new RegExp(`${ini.title} 완료`), 1400)) log('주간 계획 완료');
  if (await press(page, `${BASE}/okr/${objective.id}`, new RegExp(`${ini.title} 체크 해제`), 1400)) log('주간 계획 해제');

  // 시즌: 일정 옮기기 → 시즌 삭제
  await page.goto(`${BASE}/deadlines`, { waitUntil: 'networkidle' });
  const moveSel = page.getByLabel(new RegExp(`${evPast.title} 폴더 옮기기`)).first();
  if (await moveSel.count()) { await moveSel.selectOption({ label: season.name }); await page.waitForTimeout(1400); log('지난마감 폴더 이동'); }

  // 지우는 쪽
  if (await press(page, calOn(2), new RegExp(`${evB.title} 삭제`), 500)) {
    const ok = page.getByRole('button', { name: /지우기|삭제|확인/ }).last();
    if (await ok.count()) { await ok.click(); await page.waitForTimeout(1600); log('마감B 삭제'); }
  }
  // 지표 하나 삭제 (기록은 남아야 한다)
  const logsBefore = (await sel('session_logs', (b) => b.eq('key_result_id', krNum.id))).length;
  await db.from('key_results').delete().eq('id', krNum.id);
  const logsAfter = (await sel('session_logs', (b) => b.ilike('note', `%${krNum.title.slice(-8)}%`))).length;
  log(`숫자지표 삭제 — 기록 ${logsBefore}→${logsAfter}건 보존`);

  const bad = await invariants();
  return { acts, bad };
}

function kstMonday() {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ── 실행 ──
const base = await beginHarness();
console.log(`시작 상태: ${rowCount(base)}행\n`);
const browser = await chromium.launch();
let failures = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${BASE}/?devkey=${env.devGateToken}`, { waitUntil: 'networkidle' });

  for (let i = 1; i <= ROUNDS; i += 1) {
    const t0 = Date.now();
    const { acts, bad } = await round(page);
    console.log(`── ${i}회차 (${Math.round((Date.now() - t0) / 1000)}초) ─ 조작 ${acts.length}건`);
    console.log(`   ${acts.join(' · ')}`);
    if (bad.length) { failures += bad.length; console.log(`   ✖ 불변식 깨짐 ${bad.length}건:`); for (const b of bad) console.log(`      ${b}`); }
    else console.log('   ✔ 불변식 이상 없음');
  }
} finally {
  await browser.close();
  try {
    await endHarness();                 // 청소 + 시작 스냅샷 대조
    console.log(`\n찌꺼기 없음 확인 완료.`);
  } catch (e) {
    failures += 1;
    console.error(`\n✖ ${e.message}`);
  }
}
console.log(failures === 0 ? '\n════ 전부 통과 ════' : `\n════ 문제 ${failures}건 ════`);
process.exit(failures === 0 ? 0 : 1);
