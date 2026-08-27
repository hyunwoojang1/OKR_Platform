'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 위에서 아래로 당기면 새로고침.
 *
 * 이 앱은 홈 화면에 담아 쓰는 PWA라 주소창이 없다. 그래서 브라우저의 새로고침 버튼도 없고,
 * 값이 바뀐 걸 다시 불러올 방법이 화면 어디에도 없었다.
 *
 * router.refresh() 를 쓴다 — 페이지를 통째로 다시 여는 게 아니라 서버 컴포넌트만 다시 받는다.
 * 열어둔 입력 칸이나 스크롤이 날아가지 않는다.
 *
 * 안 걸리게 하려고 조심한 것들:
 *   · 맨 위(scrollY <= 0)에서 시작한 당김만 센다. 중간에서 스크롤하다 걸리면 안 된다.
 *   · 가로로 더 많이 움직였으면 무시한다 — 스와이프로 지우는 줄과 겹친다.
 *   · 손가락 하나일 때만. 확대(핀치)를 새로고침으로 오해하면 안 된다.
 */

const START_SLOP = 10;   // 이만큼 움직이기 전엔 방향을 판단하지 않는다
const Y_BIAS = 1.5;      // 세로가 가로보다 이만큼 커야 '당김'으로 본다
const SHOW_AT = 16;      // 이만큼 늘어나야 안내를 띄운다 — 살짝 스친 것에 뜨면 성가시다
const TRIGGER = 72;      // 이만큼 당기면 놓았을 때 새로고침
const MAX_PULL = 96;     // 고무줄이 늘어나는 한계

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  // 손가락을 대고 있는 동안엔 애니메이션을 끈다(손을 따라와야 하니까).
  // ref 로 두면 그리는 중에 읽게 되어 값이 한 박자 늦는다 — 상태로 둔다.
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'?' | 'y' | 'x'>('?');
  const router = useRouter();

  useEffect(() => {
    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1 || window.scrollY > 0 || busy) { start.current = null; return; }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      axis.current = '?';
      setDragging(true);
    }
    function onMove(e: TouchEvent) {
      const s = start.current;
      if (!s || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - s.x;
      const dy = e.touches[0].clientY - s.y;
      if (axis.current === '?') {
        if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
        // 세로가 가로보다 확실히 커야 당김으로 친다. 애매하면 가로로 본다 —
        // 줄을 왼쪽으로 쓸어 지우는 동작과 겹치는데, 거기서 새로고침이 걸리면 하던 일이 날아간다.
        axis.current = Math.abs(dy) > Math.abs(dx) * Y_BIAS ? 'y' : 'x';
      }
      if (axis.current !== 'y' || dy <= 0) { setPull(0); return; }
      // 당길수록 뻑뻑해진다 — 끝까지 쭉 늘어나면 실수로 걸린다
      setPull(Math.min(MAX_PULL, dy * 0.5));
    }
    function onEnd() {
      const enough = pull >= TRIGGER * 0.5;
      start.current = null;
      axis.current = '?';
      setDragging(false);
      if (!enough) { setPull(0); return; }
      setBusy(true);
      setPull(TRIGGER * 0.5);
      router.refresh();
      // 서버 컴포넌트가 돌아오는 걸 정확히 알 방법이 없어 짧게 보여주고 접는다.
      window.setTimeout(() => { setBusy(false); setPull(0); }, 700);
    }
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [pull, busy, router]);

  const ready = pull >= TRIGGER * 0.5;
  if (pull < SHOW_AT && !busy) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ transform: `translateY(${pull}px)`, transition: dragging ? undefined : 'transform 0.2s ease-out' }}
      aria-live="polite"
    >
      <div
        className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] shadow-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--line-strong)', color: 'var(--ink-3)' }}
      >
        <span
          className="inline-block h-3 w-3 rounded-full border-2"
          style={{
            borderColor: 'var(--line-strong)',
            borderTopColor: 'var(--accent)',
            animation: busy ? 'ptr-spin 0.7s linear infinite' : undefined,
            transform: busy ? undefined : `rotate(${pull * 4}deg)`,
          }}
          aria-hidden
        />
        {busy ? '새로고침 중' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}
      </div>
    </div>
  );
}
