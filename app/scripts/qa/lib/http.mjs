import { env } from './env.mjs';

/**
 * 서버 액션을 "화면에 있는 그 버튼" 그대로 누른다.
 *
 * Next 는 JS 없는 브라우저를 위해 폼 안에 `$ACTION_ID_<해시>` 를 hidden 으로 심어둔다.
 * 그 폼의 hidden 을 통째로 긁어 같은 URL 로 POST 하면 미들웨어·액션 직렬화·revalidate 까지
 * 진짜 경로를 그대로 통과한다.
 *
 * 해시는 빌드마다 바뀐다. 그래서 **하드코딩하지 않고 매번 발견한다** — 앵커(예: 이 픽스처의 id)를
 * 전부 담고 있는 폼을 찾는 방식. 부수 효과가 하나 있는데 그게 오히려 값지다:
 * 폼을 못 찾으면 "그 버튼이 화면에서 사라졌다"는 뜻이라, 되돌리기 버튼이 실제로 렌더되는지가
 * 공짜로 검사된다.
 */

let cookie = '';

export async function login() {
  const r = await fetch(`${env.baseUrl}/?devkey=${env.devGateToken}`, { redirect: 'manual' });
  const jar = r.headers.getSetCookie?.() ?? [];
  cookie = jar.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('세션 쿠키를 못 받았습니다. DEV_GATE_TOKEN 을 확인하세요.');
  return cookie;
}

export async function getHtml(pathname) {
  const r = await fetch(env.baseUrl + pathname, {
    headers: { cookie, 'Cache-Control': 'no-cache' },
  });
  if (!r.ok) throw new Error(`${pathname} → HTTP ${r.status}`);
  return r.text();
}

/** 폼 블록 하나에서 hidden input 들을 뽑는다. */
function hiddensOf(formHtml) {
  const out = {};
  const re = /<input\b[^>]*type="hidden"[^>]*>/g;
  for (const m of formHtml.matchAll(re)) {
    const tag = m[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    if (!name) continue;
    out[name] = /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? '';
  }
  return out;
}

/** 페이지 안의 모든 <form>…</form> (Next SSR 출력에는 폼 중첩이 없다). */
function formsOf(html) {
  return [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]);
}

/**
 * 앵커를 전부 포함하는 폼을 정확히 하나 찾는다.
 * 0개 → 버튼이 화면에 없다. 2개 이상 → 픽스처가 유일하지 않다. 둘 다 진짜 회귀다.
 */
export function findForm(html, anchor, where) {
  const wanted = Object.entries(anchor);
  const hits = formsOf(html)
    .map(hiddensOf)
    .filter((h) => wanted.every(([k, v]) => h[k] === String(v)));
  if (hits.length === 0) {
    throw new Error(`${where}: 앵커 ${JSON.stringify(anchor)} 를 담은 폼이 화면에 없습니다. `
      + '(버튼이 렌더되지 않았거나 조건이 바뀌었습니다)');
  }
  if (hits.length > 1) {
    throw new Error(`${where}: 앵커 ${JSON.stringify(anchor)} 에 폼이 ${hits.length}개 걸립니다. 픽스처를 더 좁히세요.`);
  }
  return hits[0];
}

/** 발견한 폼을 그 페이지로 되쏜다. extra 는 select 처럼 hidden 이 아닌 칸을 채울 때. */
export async function submitForm(pathname, fields) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, String(v));
  const r = await fetch(env.baseUrl + pathname, {
    method: 'POST', headers: { cookie }, body, redirect: 'manual',
  });
  const text = await r.text();
  return { status: r.status, text };
}

/** 화면에서 폼을 찾아 필드를 그대로 돌려준다(아직 안 누른다). */
export async function grabForm(pathname, anchor, extra = {}, label = '') {
  const html = await getHtml(pathname);
  return { ...findForm(html, anchor, label || pathname), ...extra };
}

/** 화면에서 폼을 찾아 그대로 누른다. */
export async function press(pathname, anchor, extra = {}, label = '') {
  return submitForm(pathname, await grabForm(pathname, anchor, extra, label));
}
