/**
 * 폼 결과를 화면으로 돌려주는 최소 도구.
 *
 * 왜 필요한가 — Next 는 프로덕션에서 서버 액션이 던진 메시지를 숨기고 digest 만 준다.
 * 그래서 "시작이 종료보다 늦습니다" 같은 안내문을 아무리 정성껏 써도 사용자에게는
 * 영어 오류 화면만 보인다(5/5 재현 확인). 자주 쓰는 폼은 던지는 대신 **돌려주고**,
 * 화면이 그걸 그 자리에 띄운다.
 *
 * 이건 새 발명이 아니라 이 레포에 이미 있던 방식이다 — actions.ts 의 suggestGoalPlan 이
 * "프로덕션에서 throw 는 digest 만 노출되므로 ok:false 로 돌려준다"고 적고 그렇게 하고 있다.
 *
 * 이 파일은 서버 전용이 아니다. 클라이언트 컴포넌트가 타입을 import 하므로
 * 'server-only' 를 넣으면 안 된다.
 */

export type ActionState = { ok: true } | { ok: false; message: string } | null;

/** 던져진 오류를 사용자에게 보여줄 한 줄로. 내용이 없으면 일반 문구로 갈음한다. */
export function actionMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  const text = raw.trim();
  if (!text) return '문제가 생겼어요. 잠시 뒤 다시 시도해주세요.';
  // Next 가 감춘 경우엔 digest 만 남는다 — 그걸 그대로 보여줘봐야 읽을 수 없다.
  if (/^Error$|digest/i.test(text)) return '문제가 생겼어요. 잠시 뒤 다시 시도해주세요.';
  return text;
}

/**
 * 모든 서버 액션 공통: 입력을 서버에서 검증하고(빈 문자열 거부), 실패는 명시적으로 던진다.
 * 'use server' 파일은 async 함수만 export 할 수 있어서 이 둘은 여기 산다.
 */
export function must(v: FormDataEntryValue | null, name: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new Error(`${name} 값이 비어 있습니다`);
  if (s.length > 500) throw new Error(`${name}이(가) 너무 깁니다`);
  return s;
}

/**
 * db() 쓰기의 결과를 확인하고, 실패하면 무엇이 실패했는지 붙여서 던진다.
 * 이걸 안 거치면 Supabase 는 던지지 않으므로 실패가 어디에도 안 남는다
 * (ESLint goalhub/checked-db-write 가 그걸 막는다).
 */
export async function run(op: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await fn();
  if (error) throw new Error(`${op} 실패: ${error.message}`);
}
