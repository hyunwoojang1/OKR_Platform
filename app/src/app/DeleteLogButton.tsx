'use client';

import { useState } from 'react';
import { deleteLog } from '@/lib/actions';

/**
 * 기록 한 줄 지우기. 잘못 눌러 사라지면 되살릴 방법이 없어서 한 번 더 확인받는다.
 * redirect: 지운 뒤 새로고침할 경로(목표 상세 등).
 */
export default function DeleteLogButton({ id, redirect }: { id: string; redirect?: string }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} aria-label="이 기록 지우기" title="이 기록 지우기"
        className="pressable shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-40 hover:!opacity-100 focus:opacity-100"
        style={{ color: 'var(--ink-4)' }}>
        ✕
      </button>
    );
  }
  return (
    <form action={deleteLog} className="flex shrink-0 items-center gap-1">
      <input type="hidden" name="id" value={id} />
      {redirect && <input type="hidden" name="redirect" value={redirect} />}
      <button type="submit" className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: 'var(--urgent)', color: '#fff' }}>
        지움
      </button>
      <button type="button" onClick={() => setAsking(false)} className="px-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
        취소
      </button>
    </form>
  );
}
