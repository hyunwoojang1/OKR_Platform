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
