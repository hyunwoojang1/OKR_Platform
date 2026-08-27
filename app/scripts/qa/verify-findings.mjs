import { chromium } from 'file:///C:/Users/notebiz765/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { beginHarness, endHarness, created } from './lib/guard.mjs';
import { db, TAG } from './lib/db.mjs';
import { makeGoal, makeDeadline, makeHabit, mk, kstToday, uniq } from './lib/fixtures.mjs';
import { env } from './lib/env.mjs';

/**
 * 감사에서 보고한 결함이 정말 있는지, 진짜 브라우저로 진짜 버튼을 눌러 확인한다.
 *
 * 왜 이걸 따로 만드나 — "네가 적대적으로 판단한 것 아니냐"는 물음에 답하려면
 * 코드 읽기나 HTTP 흉내가 아니라 사람이 하는 것과 같은 조작으로, 여러 번, 같은 결과가
 * 나오는지 보여야 한다. 각 항목을 5회 반복하고 몇 번 재현되는지 그대로 적는다.
 *
 * 판정:
 *   재현 5/5 → 결함이 맞다
 *   재현 0/5 → 내가 틀렸다. 그대로 적는다.
 *   그 사이  → 조건부. 무엇이 갈랐는지 적는다.
 */

const ROUNDS = Number(process.env.QA_ROUNDS ?? 5);
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const KEY = env.devGateToken;
const BASE = env.baseUrl;
const today = kstToday();
const CAL = `${BASE}/calendar?m=${today.slice(0, 7)}&d=${today}`;

const val = async (id) => Number((await db.from('key_results').select('current_value').eq('id', id).single()).data.current_value);
const logs = async (krId) => (await db.from('session_logs').select('id').eq('key_result_id', krId)).data.length;
const tasksOf = async (evId) => (await db.from('daily_tasks').select('id').eq('source_ref', evId)).data.length;

/** 각 항목: setup 으로 픽스처를 만들고, run 에서 브라우저를 몰아 결함 재현 여부를 돌려준다. */
const FINDINGS = [
  {
    key: 'undo-kr',
    label: '치명① 마감 완료를 되돌려도 지표가 안 내려간다',
    expect: '되돌린 뒤 지표가 0이어야 정상',
    async run(page) {
      const { kr } = await makeGoal(created, { krTitle: '자소서', target: 12 });
      const ev = await makeDeadline(created, { krId: kr.id, title: uniq('마감') });
      await page.goto(CAL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: new RegExp(`${ev.title} 다 했음`) }).click();
      await page.waitForTimeout(1200);
      const afterDo = await val(kr.id);
      await page.goto(CAL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: new RegExp(`${ev.title} 완료 되돌리기`) }).click();
      await page.waitForTimeout(1200);
      const afterUndo = await val(kr.id);
      const leftLogs = await logs(kr.id);
      return {
        reproduced: afterUndo !== 0 || leftLogs !== 0,
        detail: `완료 후 ${afterDo} → 되돌린 뒤 ${afterUndo} (0이어야 함), 남은 기록 ${leftLogs}건`,
      };
    },
  },
  {
    key: 'double-tap',
    label: '높음 완료 버튼을 연달아 두 번 누르면 중복된다',
    expect: '두 번 눌러도 지표 +1, 할일 1건이어야 정상',
    async run(page) {
      const { kr } = await makeGoal(created, { krTitle: '제출', target: 12 });
      const ev = await makeDeadline(created, { krId: kr.id, title: uniq('더블탭') });
      await page.goto(CAL, { waitUntil: 'networkidle' });
      // 사람이 빠르게 두 번 누르면 요청 두 개가 동시에 날아간다.
      // Playwright 의 click 두 번은 첫 응답 뒤 화면이 바뀌어 두 번째가 안 들어가므로,
      // 그 폼을 그대로 두 번 보내는 쪽이 실제 더블탭에 가깝다.
      const fired = await page.evaluate(async (label) => {
        const btn = [...document.querySelectorAll('button[aria-label]')]
          .find((b) => b.getAttribute('aria-label')?.includes(label));
        const form = btn?.closest('form');
        if (!form) return 0;
        const body = new FormData(form);
        const send = () => fetch(location.pathname + location.search, { method: 'POST', body });
        await Promise.all([send(), send()]);
        return 2;
      }, `${ev.title} 다 했음`);
      await page.waitForTimeout(2500);
      if (fired === 0) return { reproduced: null, detail: '완료 폼을 화면에서 못 찾음 — 판정 보류' };
      const v = await val(kr.id);
      const t = await tasksOf(ev.id);
      const l = await logs(kr.id);
      return { reproduced: v > 1 || t > 1 || l > 1, detail: `지표 +${v} (1이어야 함), 할일 ${t}건, 기록 ${l}건` };
    },
  },
  {
    key: 'ghost-task',
    label: '높음 완료한 마감을 지우면 유령 할일이 남는다',
    expect: '일정을 지우면 딸린 할일도 없어야 정상',
    async run(page) {
      const ev = await makeDeadline(created, { title: uniq('삭제될마감') });
      await page.goto(CAL, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: new RegExp(`${ev.title} 다 했음`) }).click();
      await page.waitForTimeout(1200);
      const before = await tasksOf(ev.id);
      // 화면의 삭제 버튼으로 지운다
      await page.goto(CAL, { waitUntil: 'networkidle' });
      const del = page.getByRole('button', { name: new RegExp(`${ev.title} 삭제`) });
      if (await del.count() === 0) return { reproduced: null, detail: '삭제 버튼을 화면에서 못 찾음 — 판정 보류' };
      await del.click();                       // 1단계: 정말 지울지 묻는다
      await page.waitForTimeout(400);
      const confirm = page.getByRole('button', { name: /지우기|삭제|확인/ }).last();
      if (await confirm.count()) await confirm.click();   // 2단계: 확인
      await page.waitForTimeout(1800);
      const gone = (await db.from('calendar_events').select('id').eq('id', ev.id)).data.length === 0;
      const after = await tasksOf(ev.id);
      return { reproduced: gone && after > 0, detail: `삭제 전 할일 ${before}건 → 일정 삭제(${gone ? '성공' : '실패'}) 후 ${after}건` };
    },
  },
  {
    key: 'error-screen',
    label: '높음 입력을 잘못하면 한국어 안내 대신 영어 오류 화면이 뜬다',
    expect: '무엇이 잘못됐는지 한국어로 보여야 정상',
    async run(page) {
      await page.goto(`${BASE}/deadlines`, { waitUntil: 'networkidle' });
      const plus = page.getByRole('button', { name: '＋ 폴더 만들기' });
      const direct = page.getByRole('button', { name: '직접 만들기' });
      if (await plus.count()) await plus.click(); else await direct.click();
      await page.waitForTimeout(300);
      await page.fill('input[name="name"]', uniq('오류'));
      await page.fill('input[name="starts_on"]', '2026-12-31');
      await page.fill('input[name="ends_on"]', '2026-01-01');   // 시작 > 종료 → 서버가 거부
      await page.getByRole('button', { name: '폴더 만들기' }).click();
      await page.waitForTimeout(2500);
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      const korean = body.includes('시작이 종료보다');
      const english = /server error occurred|couldn.t load/i.test(body);
      // 결함 = 서버가 말한 한국어 안내가 사용자에게 도달하지 않는 것.
      // "영어 화면이 아니다"만으로는 부족하다 — 아무 말도 안 하고 조용히 실패해도 통과해버린다.
      const alert = await page.locator('[role="alert"]').first().innerText().catch(() => '');
      return {
        reproduced: !korean,
        detail: korean
          ? `그 자리에 뜬 메시지: "${alert || '(role=alert 없음)'}"`
          : `한국어 안내 없음 · 영어화면 ${english ? 'O' : 'X'} · 화면: "${body.slice(0, 60)}"`,
      };
    },
  },
  {
    key: 'pct-100',
    label: '높음 목표값 없는 지표가 아무것도 안 했는데 100%로 보인다',
    expect: '기록 0건이면 100%가 아니어야 정상',
    async run(page) {
      // 목표에 '목표값 없는 지표' 하나만 달아둔다. 그러면 목표 진행률 = 그 지표의 진행률이다.
      const area = await mk(created, 'areas', { name: uniq('영역'), color: '#8A8A8A', sort_order: 99 });
      const objective = await mk(created, 'objectives', {
        area_id: area.id, title: uniq('목표'), period: `${today.slice(0, 4)}-Q3`, status: 'active',
      });
      const kr = await mk(created, 'key_results', {
        objective_id: objective.id, title: uniq('내용형'), target_value: null,
        current_value: 0, unit: '', source: 'manual', input_mode: 'text',
      });
      await page.goto(`${BASE}/okr/${objective.id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      const pcts = [...body.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));
      const has100 = pcts.includes(100);
      return { reproduced: has100, detail: `기록 0건 · 목표값 없음 → 화면의 진행률 ${JSON.stringify(pcts)} (${kr.title.slice(-6)})` };
    },
  },
  {
    key: 'auto-kr-exposed',
    label: '높음 자동으로 세는 지표를 손으로 올릴 수 있다',
    expect: '자동 집계 지표는 손으로 못 올리게 해야 정상 (다음 동기화가 덮어씀)',
    async run(page) {
      const { area, objective } = await makeGoal(created, { krTitle: '버림2', target: 5 });
      const habit = await mk(created, 'habits', { title: uniq('루틴'), area_id: area.id, cadence: 'daily', target_per_week: 7 });
      const kr = await mk(created, 'key_results', {
        objective_id: objective.id, title: uniq('자동지표'), target_value: 20, current_value: 0,
        unit: '회', source: 'habit_agg', source_ref: habit.id,
      });
      // '목표 진척'에 이름이 보이는 건 정상이다. 문제는 **손으로 올릴 수 있는 자리**에
      // 있는가 — 루틴 박스와 달력의 지표 선택지, 이 둘만 본다.
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      const routine = page.locator('section').filter({ has: page.getByRole('heading', { name: '루틴' }) });
      const inRoutine = await routine.count() > 0 && (await routine.first().innerText()).includes(kr.title);

      // 달력: 마감의 ⚙ 를 열어 지표 선택지를 실제로 펼친다
      const ev = await makeDeadline(created, { title: uniq('연결시험') });
      await page.goto(CAL, { waitUntil: 'networkidle' });
      const gear = page.getByRole('button', { name: new RegExp(`${ev.title} 마감 여부`) });
      let inPicker = false;
      if (await gear.count()) {
        await gear.click();
        await page.waitForTimeout(400);
        const sel = page.getByLabel(new RegExp(`${ev.title} 끝내면 오를 지표`));
        if (await sel.count()) inPicker = (await sel.locator('option').allInnerTexts()).some((o) => o.includes(kr.title));
      }
      return {
        reproduced: inRoutine || inPicker,
        detail: `루틴 박스 ${inRoutine ? '노출' : '없음'} · 달력 지표 선택지 ${inPicker ? '노출' : '없음'}`,
      };
    },
  },
  {
    key: 'overdue-gone',
    label: '높음 어제 놓친 마감이 홈에서 조용히 사라진다',
    expect: '놓친 것은 홈에 남아야 정상',
    async run(page) {
      const ev = await makeDeadline(created, { dayOffset: -1, title: uniq('어제놓침') });
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      const shown = (await page.content()).includes(ev.title);
      return { reproduced: !shown, detail: `어제(${kstToday(-1)}) 미완료 마감이 홈에 ${shown ? '보임' : '안 보임'}` };
    },
  },
  {
    key: 'bad-date',
    label: '중간 날짜가 깨진 일정 하나가 지난 마감 화면을 죽인다',
    expect: '그 행만 건너뛰고 나머지가 그려져야 정상',
    async run(page) {
      // 애초에 DB가 깨진 날짜를 받아주는지부터 본다
      const { error } = await db.from('calendar_events').insert({
        title: `${TAG} 깨진날짜`, starts_at: 'not-a-date', all_day: false,
        source: 'app', sync_status: 'local', pinned: false,
      });
      if (error) return { reproduced: false, detail: `DB가 깨진 날짜를 거부함 — 이 경로로는 못 만든다: ${error.message.slice(0, 60)}` };
      const r = await page.goto(`${BASE}/deadlines`, { waitUntil: 'networkidle' });
      return { reproduced: (r?.status() ?? 500) >= 500, detail: `/deadlines HTTP ${r?.status()}` };
    },
  },
  {
    key: 'kr-delete-wipes-logs',
    label: '치명② 지표를 지우면 손으로 적은 기록이 함께 사라진다',
    expect: '지표를 지워도 기록은 남아야 정상 (actions.ts:1085 주석이 그렇게 말한다)',
    async run() {
      const { kr } = await makeGoal(created, { krTitle: '기록보존', target: 5 });
      const { error: logErr } = await db.from('session_logs').insert({
        key_result_id: kr.id, kind: 'check', note: `${TAG} 손으로 적은 소중한 기록`,
      });
      if (logErr) return { reproduced: null, detail: `기록 삽입 실패: ${logErr.message}` };
      const before = await logs(kr.id);
      await db.from('key_results').delete().eq('id', kr.id);
      const after = (await db.from('session_logs').select('id').ilike('note', `%손으로 적은 소중한%`)).data.length;
      return { reproduced: before === 1 && after === 0, detail: `삭제 전 기록 ${before}건 → 지표 삭제 후 ${after}건` };
    },
  },
];

const targets = FINDINGS.filter((f) => !only || f.key === only);
const results = [];

await beginHarness();
const browser = await chromium.launch();
try {
  for (const f of targets) {
    const tally = [];
    for (let i = 1; i <= ROUNDS; i += 1) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/?devkey=${KEY}`, { waitUntil: 'networkidle' });
      let r;
      try { r = await f.run(page); } catch (e) { r = { reproduced: null, detail: `실행 오류: ${String(e.message).slice(0, 90)}` }; }
      tally.push(r);
      await ctx.close();
      process.stdout.write(`  ${f.key} ${i}/${ROUNDS} ${r.reproduced === true ? '재현' : r.reproduced === false ? '정상' : '보류'}\r`);
    }
    const yes = tally.filter((t) => t.reproduced === true).length;
    const no = tally.filter((t) => t.reproduced === false).length;
    const skip = tally.filter((t) => t.reproduced === null).length;
    results.push({ f, yes, no, skip, tally });
    console.log(`\n[${yes}/${ROUNDS} 재현] ${f.label}`);
    console.log(`   기대: ${f.expect}`);
    for (const t of tally) console.log(`     · ${t.detail}`);
  }
} finally {
  await browser.close();
  await endHarness();
}

console.log('\n══════ 판정 ══════');
for (const r of results) {
  const verdict = r.yes === ROUNDS ? '결함 확정' : r.yes === 0 ? '내가 틀렸음' : `조건부(${r.yes}/${ROUNDS})`;
  console.log(`  ${String(r.yes).padStart(2)}/${ROUNDS}  ${verdict.padEnd(12)} ${r.f.label}`);
}
