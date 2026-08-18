'use client';

import { useState } from 'react';
import { createTask } from '@/lib/actions';
import type { Area } from '@/lib/types';

// FAB + 바텀시트 (CSS 전용, 0kb) — 인라인 폼 대신 네이티브식 「새로 만들기」
export default function AddTaskSheet({ areas }: { areas: Area[] }) {
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState('');

  return (
    <div className={open ? 'sheet-open' : ''}>
      <button
        aria-label="할일 추가"
        onClick={() => setOpen(true)}
        className="pressable fixed bottom-24 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-light"
        style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: 'var(--shadow-raised)' }}
      >
        ＋
      </button>
      <div className="sheet-backdrop" onClick={() => setOpen(false)} />
      <div className="sheet" role="dialog" aria-label="할일 추가">
        <div className="sheet-grab" />
        <p className="t-title mb-4">새 할일</p>
        <form
          action={async (fd) => {
            await createTask(fd);
            setOpen(false);
            setAreaId('');
          }}
          className="space-y-4"
        >
          <input name="title" placeholder="무엇을 할까요?" className="w-full" required autoComplete="off" />
          {/* 영역: select 대신 컬러 칩 세그먼트 */}
          <input type="hidden" name="area_id" value={areaId} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAreaId('')}
              className="chip"
              style={areaId === '' ? { background: 'var(--ink)', color: 'var(--bg)' } : undefined}
            >
              없음
            </button>
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaId(a.id)}
                className="chip"
                style={
                  areaId === a.id
                    ? { background: a.color, color: '#fff' }
                    : { color: a.color }
                }
              >
                <span className="area-dot" style={{ background: a.color }} />
                {a.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="t-sub" htmlFor="due">마감일</label>
            <input id="due" type="date" name="due_date" className="flex-1" />
          </div>
          <button type="submit" className="btn btn-primary w-full py-3 text-base">추가</button>
        </form>
      </div>
    </div>
  );
}
