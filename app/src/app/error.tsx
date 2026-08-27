'use client';

import Link from 'next/link';

/**
 * 화면이 죽었을 때 보이는 자리.
 *
 * 왜 필요한가 — 2026-08-27 감사에서 5/5 재현:
 *   폴더 만들기에서 시작일을 종료일보다 늦게 넣으면 서버가 "시작이 종료보다 늦습니다"를
 *   던지는데, 사용자가 실제로 본 건 이거였다:
 *     "This page couldn't load — A server error occurred. Reload to try again. ERROR 4077188738"
 *   화면 전체가 이걸로 대체되고 쓰던 내용도 같이 날아간다. 곳곳에 써둔 한국어 안내문이
 *   단 한 줄도 사용자에게 도달하지 않고 있었다.
 *
 * Next 는 프로덕션에서 오류 내용을 숨기고 digest 만 준다. 그래서 여기서는 원문을
 * 기대하지 않는다 — 대신 "무엇을 해볼 수 있는지"를 한국어로 말하고, digest 는 작게 남겨
 * 나중에 로그와 맞춰볼 수 있게 한다.
 */
export default function Error({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 개발 중에는 실제 메시지가 살아 있다. 있으면 보여주는 게 훨씬 빠르다.
  const detail = error?.message && !/^\s*$/.test(error.message) ? error.message : null;

  /*
    배포가 막 끝난 순간에 화면을 열어두고 있으면, 브라우저가 들고 있던 옛 주소의 조각 파일이
    사라져서 다음 클릭에 이게 뜬다. 코드가 잘못된 게 아니라 새 버전이 올라간 것뿐이라
    새로고침 한 번이면 끝난다. "다시 시도"는 같은 옛 조각을 또 찾으므로 이 경우엔 소용이 없다.
  */
  const isStale = /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i
    .test(`${error?.name ?? ''} ${error?.message ?? ''}`);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-[20px]"
        style={{ background: 'var(--surface-2, var(--line-soft))', color: 'var(--ink-3)' }}
        aria-hidden
      >
        ⚑
      </div>

      <div className="space-y-1.5">
        <h1 className="text-[19px] font-medium tracking-tight">
          {isStale ? '새 버전이 올라갔어요' : '이 화면을 못 그렸어요'}
        </h1>
        <p className="t-sub">
          {isStale
            ? '보고 계시던 화면이 이전 버전이라 멈췄습니다. 새로고침하면 그대로 이어집니다.'
            : '방금 한 동작이 서버에서 막혔습니다. 다시 시도하면 대개 그냥 됩니다.'}
        </p>
      </div>

      {detail && !isStale && (
        <p
          className="w-full rounded-xl px-3 py-2.5 text-left text-[13px]"
          style={{ background: 'var(--line-soft)', color: 'var(--ink-2)' }}
        >
          {detail}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {isStale ? (
          <button type="button" onClick={() => location.reload()} className="btn btn-dark">새로고침</button>
        ) : (
          <button type="button" onClick={reset} className="btn btn-dark">다시 시도</button>
        )}
        <Link href="/" className="btn">홈으로</Link>
      </div>

      {error?.digest && (
        <p className="mono text-[10.5px]" style={{ color: 'var(--ink-4)' }}>
          {error.digest}
        </p>
      )}
    </main>
  );
}
