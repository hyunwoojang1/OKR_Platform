import { db } from '../qa/lib/db.mjs';
import { cleanEventTitle, isDeadlineEvent } from '../../src/lib/deadline.ts';

/**
 * 이미 저장된 달력 일정의 제목을 지금 규칙으로 한 번 정리하고, 마감 판정을 채운다.
 *
 * 왜 스크립트로 남기는가 — 2026-08-27 검수 지적:
 *   처음엔 이걸 일회용으로 돌려서 프로덕션 데이터 11건을 바꿨는데, 레포에 아무 기록이
 *   남지 않았다. 무엇이 어떻게 바뀌었는지 나중에 확인할 방법이 없고 되돌릴 근거도 없다.
 *   그래서 여기 둔다. 몇 번을 돌려도 결과가 같다(멱등).
 *
 * 그때 배운 것 하나 더:
 *   제목만 정리하고 마감 판정을 같이 저장하지 않으면, 판정 규칙이 보는 단서('마감'·'🔴')가
 *   제목에서 사라져 진짜 마감이 '마감 아님'이 된다. 실제로 과거 일정 한 건이 그렇게 됐다.
 *   그래서 이 스크립트는 둘을 반드시 같이 한다.
 *
 *   node scripts/maintenance/clean-event-titles.mjs           미리보기
 *   node scripts/maintenance/clean-event-titles.mjs --apply   적용
 */

const apply = process.argv.includes('--apply');

const { data: events, error } = await db
  .from('calendar_events').select('id,title,is_deadline').limit(5000);
if (error) throw new Error(`일정 조회 실패: ${error.message}`);

const plan = [];
for (const e of events) {
  const title = cleanEventTitle(e.title);
  // 판정은 **정리 전** 제목으로 내린다. 정리 후 제목에는 단서가 없다.
  const guess = isDeadlineEvent({ title: e.title, is_deadline: null });
  const patch = {};
  if (title !== e.title) patch.title = title;
  // 아직 아무도 안 정한 것만 채운다 — 사용자가 ⚙ 로 뒤집어 둔 값은 건드리지 않는다.
  if (e.is_deadline === null) patch.is_deadline = guess;
  if (Object.keys(patch).length > 0) plan.push({ id: e.id, from: e.title, patch });
}

console.log(`${events.length}건 중 바꿀 것 ${plan.length}건${apply ? ' — 적용합니다' : ' (미리보기, --apply 로 실행)'}\n`);
for (const p of plan) {
  console.log(`  ${p.from.split('\n')[0].slice(0, 52)}`);
  if (p.patch.title !== undefined) console.log(`    제목 → ${p.patch.title.slice(0, 52)}`);
  if (p.patch.is_deadline !== undefined) console.log(`    마감 → ${p.patch.is_deadline}`);
}
if (!apply || plan.length === 0) process.exit(0);

for (const p of plan) {
  const { error: upErr } = await db.from('calendar_events').update(p.patch).eq('id', p.id);
  if (upErr) throw new Error(`${p.id} 갱신 실패: ${upErr.message}`);
}
console.log(`\n${plan.length}건 적용. 다시 돌리면 0건이어야 정상입니다.`);
