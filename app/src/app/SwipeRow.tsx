'use client';

import { useRef, useState } from 'react';

/**
 * 왼쪽으로 쓸면 휴지통이 나오는 줄.
 *
 * 쓸어서 바로 지우지 않는다 — 되돌릴 수 없는 일이라 손가락이 스치는 것만으로 지워지면 사고가 난다.
 * 쓸면 휴지통이 드러나고, 그걸 눌러야 "정말 지울까요?"가 뜨고, 거기서 한 번 더 눌러야 지워진다.
 *
 * 손가락이 없는 환경(데스크톱·스크린리더)에서도 길이 있어야 하므로,
 * 줄에 마우스를 올리거나 키보드로 초점이 오면 같은 버튼이 그대로 보인다.
 */
export default function SwipeRow({
  children, onDelete, label, confirmText = '지울까요?',
}: {
  children: React.ReactNode;
  /** 삭제를 실제로 수행하는 폼 (서버 액션). 확인을 누르면 이걸 제출한다. */
  onDelete: React.ReactNode;
  /** 무엇을 지우는지 — 접근성 이름과 확인 문구에 쓴다 */
  label: string;
  confirmText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const startX = useRef<number | null>(null);
  const moved = useRef(false);

  const onStart = (x: number) => { startX.current = x; moved.current = false; };
  const onMove = (x: number) => {
    if (startX.current == null) return;
    const dx = x - startX.current;
    if (Math.abs(dx) > 8) moved.current = true;
    if (dx < -36) setOpen(true);
    if (dx > 36) { setOpen(false); setAsking(false); }
  };
  const onEnd = () => { startX.current = null; };

  return (
    <li className="relative overflow-hidden">
      {/* 뒤에 깔린 휴지통 — 쓸면 이게 드러난다 */}
      <div className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-2">
        {asking ? (
          <>
            <span className="t-cap whitespace-nowrap">{confirmText}</span>
            <span onClick={() => { setOpen(false); setAsking(false); }}>{onDelete}</span>
            <button type="button" onClick={() => { setAsking(false); setOpen(false); }}
              aria-label={`${label} 삭제 취소`} className="t-cap underline" style={{ color: 'var(--ink-3)' }}>
              취소
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(true); setAsking(true); }}
            aria-label={`${label} 지우기`}
            title="지우기"
            className={`pressable rounded-lg px-2 py-1 text-[15px] transition-opacity ${open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-60 focus-visible:opacity-100'}`}
            style={{ color: 'var(--ink-3)' }}
          >
            🗑
          </button>
        )}
      </div>

      {/* 실제 줄. 쓸면 왼쪽으로 밀려 뒤가 보인다. */}
      <div
        className="group/row transition-transform"
        style={{ transform: open ? 'translateX(-92px)' : 'translateX(0)' }}
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={(e) => onStart(e.clientX)}
        onMouseMove={(e) => { if (startX.current != null) onMove(e.clientX); }}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
      >
        {children}
      </div>
    </li>
  );
}
