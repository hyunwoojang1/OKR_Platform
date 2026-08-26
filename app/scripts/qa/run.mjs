import { withHarness } from './lib/guard.mjs';
import { introspect, rowCount, snapshot } from './lib/db.mjs';
import { login, getHtml } from './lib/http.mjs';
import { env } from './lib/env.mjs';

/**
 * 안전장치만 확인하는 진입점.
 *
 *   node scripts/qa/run.mjs --dry     아무것도 쓰지 않고 ①②③ 만 확인
 *   node scripts/qa/run.mjs           로그인·페이지 접근까지 확인 (여전히 쓰지는 않는다)
 *
 * 실제 검사는 scripts/qa/*.test.mjs 가 한다. 이 파일은 "하네스가 도는가"를 먼저 믿게 하려는 것.
 */

const dry = process.argv.includes('--dry');

const code = await withHarness(async () => {
  const { names, tables } = await introspect();
  console.log(`테이블 ${names.length}개: ${names.join(', ')}`);
  const nullableCount = Object.values(tables).reduce(
    (n, t) => n + Object.keys(t.columns).filter((c) => !t.notNull.has(c)).length, 0,
  );
  console.log(`컬럼 정보 확보 — NOT NULL 아닌 칸 ${nullableCount}개 (타입 대조에 쓴다)`);

  await login();
  for (const p of ['/', '/calendar', '/deadlines', '/okr']) {
    const html = await getHtml(p);
    const forms = (html.match(/<form\b/g) ?? []).length;
    const actions = new Set([...html.matchAll(/\$ACTION_ID_([a-f0-9]+)/g)].map((m) => m[1])).size;
    console.log(`  ${p.padEnd(11)} 폼 ${String(forms).padStart(2)}개 · 서버 액션 ${actions}종`);
  }
  console.log('\n쓰기는 하지 않았습니다. 실제 검사는 `npm run qa`.');
}, { dry });

if (!dry) {
  const snap = await snapshot();
  console.log(`현재 총 ${rowCount(snap)}행 · 대상 ${env.baseUrl}`);
}

process.exit(code);
