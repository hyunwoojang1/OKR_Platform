import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { beginHarness, endHarness, created } from './lib/guard.mjs';
import { snapshot, diff, fmtDiff, touchedTables } from './lib/db.mjs';
import { login, press, grabForm, submitForm } from './lib/http.mjs';
import { CHAINS } from './chains.mjs';

/**
 * 표(chains.mjs) 한 줄에서 검사 세 개가 자동으로 나온다.
 *
 *   T1 연쇄 범위 — do 가 실제로 건드린 테이블 == 선언한 touches
 *   T2 왕복      — do → undo 를 세 번 반복해도 최초와 차이 0
 *   T3 멱등      — do → do 가 do 한 번과 같은 상태
 *
 * 왜 세 번인가: 한 번만 하면 "한 번은 맞는데 반복하면 쌓이는" 결함을 놓친다.
 * 실제 사고가 정확히 그 모양이었다.
 */

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const targets = CHAINS.filter((c) => !only || c.key === only);

before(async () => {
  await beginHarness();
  await login();
});
after(async () => { await endHarness(); });

/** 이 연쇄가 눈감아 줄 컬럼 목록을 diff 옵션 모양으로. */
const ignoreOf = (chain) => Object.fromEntries(chain.touches.map((t) => [t, chain.volatile ?? []]));

for (const chain of targets) {
  test(`${chain.key} — ${chain.label}`, async (t) => {
    const ctx = await chain.setup(created);
    const doStep = () => press(ctx.page, ctx.do.anchor, ctx.do.extra ?? {}, `${chain.key} do`);
    const undoStep = () => press(ctx.undo.page ?? ctx.page, ctx.undo.anchor, ctx.undo.extra ?? {}, `${chain.key} undo`);

    await t.test('T1 선언한 테이블만 건드린다', async () => {
      const b = await snapshot();
      await doStep();
      const observed = touchedTables(diff(b, await snapshot(), { ignore: ignoreOf(chain) }));
      const declared = [...chain.touches].sort();
      const surprise = observed.filter((x) => !declared.includes(x));
      assert.deepEqual(surprise, [],
        `선언에 없는 테이블을 건드렸습니다: ${surprise.join(', ')}\n`
        + `  선언: ${declared.join(', ')}\n  실제: ${observed.join(', ')}\n`
        + `  → chains.mjs 의 touches 에 추가하거나, 안 건드리게 고치세요.`);
      // 되돌려 놓고 다음 검사로
      if (ctx.undo) await undoStep();
    });

    if (chain.roundTrip !== true) {
      t.diagnostic(`T2 건너뜀 — ${chain.roundTrip}`);
    } else {
      await t.test('T2 do→undo 를 3회 반복해도 최초와 같다', async () => {
        const b = await snapshot();
        for (let i = 1; i <= 3; i += 1) {
          await doStep();
          await undoStep();
          const left = diff(b, await snapshot(), { ignore: ignoreOf(chain) });
          assert.equal(left.length, 0,
            `${i}회차에서 어긋났습니다 — 되돌리기가 do 를 다 못 되돌립니다:\n${fmtDiff(left)}`);
        }
      });
    }

    if (chain.idempotent !== true) {
      t.diagnostic(`T3 건너뜀 — ${chain.idempotent}`);
    } else {
      await t.test('T3 같은 요청을 두 번 보내도 결과가 같다', async () => {
        // 더블탭·재시도는 "같은 폼을 두 번 제출"하는 것이다. 화면에서 버튼을 다시 찾아 누르는 게
        // 아니라(토글은 누르면 값이 뒤집혀 그 버튼이 사라진다), 브라우저가 들고 있던
        // 그 payload 를 그대로 두 번 쏜다.
        const payload = await grabForm(ctx.page, ctx.do.anchor, ctx.do.extra ?? {}, `${chain.key} do`);
        await submitForm(ctx.page, payload);
        const once = await snapshot();
        await submitForm(ctx.page, payload);
        const twice = await snapshot();
        const extra = diff(once, twice, { ignore: ignoreOf(chain) });
        assert.equal(extra.length, 0,
          `두 번째 요청이 상태를 또 바꿨습니다 — 더블탭·재시도에 중복이 생깁니다:\n${fmtDiff(extra)}`);
        if (ctx.undo) await undoStep();
      });
    }
  });
}
