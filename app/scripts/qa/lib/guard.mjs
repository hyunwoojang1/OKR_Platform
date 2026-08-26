import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.mjs';
import { db, TAG, snapshot, diff, fmtDiff, rowCount, introspect } from './db.mjs';

/**
 * 이 하네스는 진짜 데이터베이스를 건드린다. 그래서 순서가 하나뿐이다.
 *
 *   ① 여기가 정말 로컬인가        ② 서버가 살아 있나        ③ 전량 스냅샷이 떠지나
 *   → 셋 다 통과해야 비로소 가짜 데이터를 만든다.
 *   ④ 끝나면 만든 것을 id 로 지우고 ⑤ 표식으로 한 번 더 훑고 ⑥ 최초 스냅샷과 대조한다.
 *   ⑥ 이 0이 아니면 요란하게 실패한다. 조용히 남는 쓰레기가 제일 나쁘다.
 */

const LOCK = path.join(env.appDir, '.qa.lock');

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** S1 — 프로덕션에서는 절대 안 돈다. */
function assertLocal() {
  if (process.env.VERCEL || process.env.CI) {
    fail('VERCEL/CI 환경에서는 실행하지 않습니다. 이 하네스는 실제 DB에 씁니다.');
  }
  let host;
  try { host = new URL(env.baseUrl).hostname; } catch { fail(`QA_BASE_URL 이 이상합니다: ${env.baseUrl}`); }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal && !env.allowRemote) {
    fail(`${env.baseUrl} 은 로컬이 아닙니다. 정말 원하면 QA_ALLOW_REMOTE=1 을 붙이세요.`);
  }
  if (!isLocal) console.warn(`⚠ 원격(${host})에 대고 돕니다. QA_ALLOW_REMOTE=1 이 켜져 있습니다.`);
}

/** S2 — 서버가 안 떠 있으면 픽스처를 만들지 않는다. */
async function assertServerUp() {
  try {
    const r = await fetch(`${env.baseUrl}/?devkey=${env.devGateToken}`, { redirect: 'manual' });
    if (r.status >= 500) fail(`서버가 ${r.status} 를 돌려줍니다: ${env.baseUrl}`);
  } catch (e) {
    fail(`서버에 못 붙었습니다 (${env.baseUrl}). 먼저 띄우세요:\n    npm run build && npx next start -p 3007\n  ${e.message}`);
  }
}

/** S9 — 두 개가 동시에 돌면 서로의 스냅샷을 오염시킨다. */
function acquireLock() {
  if (fs.existsSync(LOCK)) {
    fail(`이미 QA 가 돌고 있습니다 (${LOCK}). 아니라면 그 파일을 지우세요.`);
  }
  fs.writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}\n`);
}
function releaseLock() {
  try { fs.rmSync(LOCK, { force: true }); } catch { /* 이미 없으면 그만 */ }
}

/** S5 — 태그 없는 값으로는 아무것도 못 만들게. */
export function tagged(text) {
  const s = `${TAG} ${text}`;
  return s;
}
export function assertTagged(row) {
  const blob = JSON.stringify(row);
  if (!blob.includes(TAG)) {
    throw new Error(`태그 없는 행을 만들려 했습니다. 모든 가짜 데이터에는 ${TAG} 가 있어야 합니다.\n  ${blob.slice(0, 200)}`);
  }
}

/** S6 — 표식 붙은 행이 남았는지 훑는다. */
async function sweepTagged() {
  const { names } = await introspect();
  const left = [];
  for (const t of names) {
    const { data } = await db.from(t).select('*').limit(2000);
    for (const row of data ?? []) {
      if (JSON.stringify(row).includes(TAG)) {
        await db.from(t).delete().eq('id', row.id);
        left.push({ table: t, id: row.id });
      }
    }
  }
  return left;
}

/**
 * 하네스 본체를 감싸는 껍데기.
 * fn 은 { base, created } 를 받는다. created 에 push 한 { table, id } 는 끝나고 지워진다.
 */
export async function withHarness(fn, { dry = false } = {}) {
  assertLocal();
  await assertServerUp();
  acquireLock();

  const created = [];
  let before = null;
  let exitCode = 0;

  const cleanup = async () => {
    // ④ 만든 순서의 역순으로 지운다 — 참조가 걸려 있어도 걸리지 않게.
    for (let i = created.length - 1; i >= 0; i -= 1) {
      const { table, id } = created[i];
      try { await db.from(table).delete().eq('id', id); } catch { /* 아래 훑기가 잡는다 */ }
    }
    const strays = await sweepTagged();
    if (strays.length) {
      console.warn(`⚠ id 로 못 지운 표식 행 ${strays.length}건을 훑어서 지웠습니다:`,
        strays.map((s) => `${s.table}/${String(s.id).slice(0, 8)}`).join(', '));
    }
  };

  const onSignal = () => { void cleanup().finally(() => { releaseLock(); process.exit(130); }); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    // ③ 스냅샷을 못 뜨면 여기서 끝. 아직 아무것도 안 만들었다.
    before = await snapshot();
    console.log(`스냅샷 ${Object.keys(before).length}개 테이블 / ${rowCount(before)}행`);
    if (dry) {
      console.log('--dry — 아무것도 쓰지 않고 안전장치만 확인했습니다.');
      return 0;
    }
    await fn({ created, before });
  } catch (e) {
    console.error('\n✖ 하네스 실행 중 오류:', e?.message ?? e);
    exitCode = 1;
  } finally {
    await cleanup();
    // ⑥ 최초와 대조. 여기가 0이 아니면 실패다 — 남은 쓰레기가 다음 실행을 오염시킨다.
    if (before) {
      const after = await snapshot();
      const left = diff(before, after);
      if (left.length) {
        const file = path.join(env.appDir, `.qa-leak-${Date.now()}.json`);
        fs.writeFileSync(file, JSON.stringify(left, null, 2));
        console.error(`\n✖ 복구가 완전하지 않습니다 — ${left.length}건이 남았습니다:`);
        console.error(fmtDiff(left));
        console.error(`  자세한 내용: ${file}`);
        exitCode = 1;
      } else {
        console.log('복구 확인 — 최초 스냅샷과 차이 0건.');
      }
    }
    releaseLock();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  return exitCode;
}
