# OKR_Platform — 작업 규약

`app/AGENTS.md` 는 `next dev` 가 다시 쓰는 파일이라 규약을 거기 두면 사라진다.
이 파일(레포 루트)은 next 가 못 건드린다.

## DDL·임의 SQL — 에이전트가 직접 실행한다

**사용자에게 "대시보드에서 실행해 주세요"로 넘기지 말 것.**
(같은 지시가 `realestate_auctions/CLAUDE.md` 에도 있고, 2026-08-27 에 한 번 어겨서
사용자가 토큰을 다시 발급하게 만들었다.)

- 토큰: `app/.env.local` 의 `SUPABASE_ACCESS_TOKEN` (`sbp_…`). gitignore 됨.
  없으면 `realestate_auctions/.env` 에도 같은 이름으로 있을 수 있다.
  둘 다 없을 때만 사용자에게 요청한다 — 그전에 **두 곳을 다 확인할 것.**
- 프로젝트 ref: `trajmfklbyarbkiljogj` (Supabase 프로젝트 이름은 "Finance AI",
  goalhub 스키마가 거기 산다)
- 실행:
  ```
  POST https://api.supabase.com/v1/projects/trajmfklbyarbkiljogj/database/query
  Authorization: Bearer $SUPABASE_ACCESS_TOKEN
  {"query": "<SQL>"}
  ```
  DDL·DML 같은 엔드포인트. 결과는 JSON 배열.
- 파괴적 변경(drop/delete/truncate)은 사용자 확인 후.
- 마이그레이션은 `db/NNN_*.sql` 로 남기고, 번호를 쓰기 전에 `ls db/` 로 중복을 확인한다
  (003·004 가 실제로 겹친 적 있다).

## 검사 — 커밋 전에 돌린다

| 명령 | 무엇을 보나 |
|---|---|
| `npm run typecheck` | 타입 |
| `npm run lint` | 결과를 안 보는 db() 쓰기 금지 규칙 포함 |
| `npm run qa` | 연쇄 왕복·멱등 (서버가 떠 있어야 함) |
| `npm run qa:verify` | 과거에 보고된 결함이 되살아났는지 5회씩 |

`qa` 계열은 **실제 Supabase**를 건드린다. 태그(`⟦QA⟧`) 붙은 행만 만들고 끝나면 전량
지운 뒤 시작 스냅샷과 대조해 차이 0을 확인한다. 로컬이 아니면 실행을 거부한다.

## 편집 직후 린트 (자동)

`.claude/settings.json` 이 `Edit|Write` 뒤에 `.claude/hooks/lint-edited.mjs` 를 돌린다.
방금 고친 파일 하나만 본다(1~2초). 규칙을 어기면 **다음 줄로 넘어가기 전에** 걸린다.

커밋 훅이 아니라 편집 직후인 이유: 커밋까지 미루면 같은 실수가 이미 열 군데에 퍼져 있다.
실제로 하루에 같은 접근성 결함을 세 번 만든 적이 있다.

## 코드 규약

이 항목들은 전부 **실제로 사고가 난 뒤에** 생겼다. 각 줄에 그걸 잡는 검사가 붙어 있다.

1. `db()` 의 쓰기는 `run()` 을 거치거나 `const { error } = await` 로 받는다.
   결과를 버리는 쓰기 금지. → *ESLint `goalhub/checked-db-write`*
2. 지표(`key_results.current_value`)는 **`kr-ledger.ts` 밖에서 만지지 않는다.**
   올리는 곳과 내리는 곳이 갈라지면 되돌리기가 반만 된다. → *`npm run qa` T2*
3. 무언가를 만드는 연쇄를 추가하면 **되돌리기를 같은 파일에 나란히** 쓴다.
   `event-done.ts` 맨 위의 효과 대조표가 본보기다. → *`npm run qa` T1·T2*
4. 같은 요청이 두 번 와도 결과가 같아야 한다. 멱등성은 코드의 `if (!exists)` 가 아니라
   **조건부 UPDATE나 DB 유니크 제약**으로 보장한다 — 동시에 들어온 둘은 코드로 못 막는다.
   → *`npm run qa` T3*
5. 코드가 DB에 대해 믿는 것(cascade·nullable)은 주석이 아니라 검사로 적는다.
   주석과 스키마가 다르면 **스키마가 이긴다**. → *`qa:verify`*
6. 사용자에게 보일 오류는 화면에 한국어로 남는다. `throw` 메시지에 기대지 말 것 —
   프로덕션에서는 digest 로 가려진다. 자주 쓰는 폼은 `*State` 래퍼 + `useActionState`.
7. 반복되는 버튼(목록의 각 줄)은 `aria-label` 에 **항목 이름을 넣는다.**
   같은 이름이 여러 개면 스크린리더로 못 고른다. 이 레포에서 두 번 났다.

## 배포

Git push 는 배포를 트리거하지 않는다(Git 연동 아님). 배포는 명시적으로:

```
cd app && npx vercel --prod --force --yes
npx vercel alias set <새 URL> goal-hub-blue.vercel.app
npx vercel alias set <새 URL> goal-hub-hyunwoo-jang-s-projects.vercel.app
```

`goal-hub-blue.vercel.app` 이 실제로 쓰는 주소다. 사용자가 배포하지 말라고 하면
push 까지만 한다.
