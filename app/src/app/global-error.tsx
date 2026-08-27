'use client';

/**
 * layout 자체가 깨졌을 때의 마지막 그물. error.tsx 는 layout 안에서 렌더되므로
 * layout 이 죽으면 그것마저 못 그린다. 그래서 여기는 자기 html/body 를 직접 세운다.
 *
 * 앱 스타일시트도 못 탈 수 있어 색을 인라인으로 박는다 — 여기서까지 토큰에 기대면
 * 정작 필요한 순간에 흰 화면이 된다.
 */
export default function GlobalError({ error, reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{
        margin: 0,
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAF9F5',
        color: '#23211D',
        fontFamily: 'system-ui, -apple-system, "Malgun Gothic", sans-serif',
        padding: '24px',
      }}>
        <main style={{ maxWidth: 380, textAlign: 'center' }}>
          <h1 style={{ fontSize: 19, fontWeight: 500, margin: '0 0 8px' }}>앱을 못 띄웠어요</h1>
          <p style={{ fontSize: 14, color: '#5C574F', margin: '0 0 18px', lineHeight: 1.7 }}>
            화면 전체가 뜨지 못했습니다. 새로고침해도 같으면 잠시 뒤 다시 열어주세요.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 'none', borderRadius: 14, padding: '10px 18px',
              background: '#23211D', color: '#fff', fontSize: 15, cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
          {error?.digest && (
            <p style={{ fontSize: 10.5, color: '#9A948A', marginTop: 14, fontFamily: 'ui-monospace, monospace' }}>
              {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
