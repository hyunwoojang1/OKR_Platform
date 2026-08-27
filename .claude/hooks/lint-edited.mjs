#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 방금 고친 파일 하나만 린트한다.
 *
 * 왜 커밋 훅이 아니라 편집 직후인가 — 이 레포는 사실상 Claude Code 가 쓴다.
 * 결과를 안 보는 db() 쓰기, 반복되는 버튼의 같은 aria-label 같은 것은
 * "쓰는 중"에 걸려야 그 자리에서 고쳐진다. 커밋까지 미루면 이미 열 군데에 퍼져 있다.
 * (오늘 하루에만 같은 접근성 결함을 세 번 만들었다.)
 *
 * 느리면 아무도 안 쓰게 되므로 파일 하나만 본다. 보통 1~2초.
 */

const REPO = path.resolve(import.meta.dirname, '..', '..');
const APP = path.join(REPO, 'app');

let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch { /* stdin 없으면 그냥 통과 */ }

let file = '';
try {
  const payload = JSON.parse(input || '{}');
  file = payload.tool_input?.file_path ?? payload.tool_input?.filePath ?? '';
} catch { /* 형식이 다르면 조용히 통과 — 훅이 작업을 막으면 안 된다 */ }

if (!file) process.exit(0);
const rel = path.relative(APP, file).replace(/\\/g, '/');
// app/src 안의 TS/TSX 만. 그 밖(문서·SQL·스크립트)은 대상이 아니다.
if (rel.startsWith('..') || !/^src\/.+\.(ts|tsx)$/.test(rel)) process.exit(0);
if (!fs.existsSync(file)) process.exit(0);

const r = spawnSync('npx', ['eslint', '--format', 'stylish', rel], {
  cwd: APP, encoding: 'utf8', shell: true, timeout: 40_000,
});
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();

if (r.status === 0) process.exit(0);

// 에이전트에게 그대로 보이도록 stderr 로 내보내고 2로 끝낸다.
console.error(
  `방금 고친 ${rel} 에서 린트가 걸렸습니다. 다음 줄로 넘어가기 전에 고치세요.\n\n${out}\n`
  + '(규칙 이유는 레포 루트 CLAUDE.md 의 "코드 규약" 참고)',
);
process.exit(2);
