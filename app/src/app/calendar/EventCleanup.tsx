'use client';

import { useState } from 'react';
import { deleteEvent } from '@/lib/actions';
import type { CalendarEvent } from '@/lib/types';

/**
 * 일정 삭제는 구글 캘린더까지 전파되고 앱에서는 되돌릴 수 없다.
 * 그래서 지우기 전에 무엇이 지워지는지 이름을 그대로 보여주고 한 번 더 확인받는다.
 */
export function DeleteEventButton({ event }: { event: CalendarEvent }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={`${event.title} 삭제`}
        title="삭제 — 구글 캘린더에서도 지워집니다"
        className="pressable text-xs opacity-40 hover:opacity-100"
        style={{ color: 'var(--ink-4)' }}
      >
        ✕
      </button>
    );
  }
  return (
    <form action={deleteEvent} className="flex shrink-0 items-center gap-1.5">
      <input type="hidden" name="id" value={event.id} />
      <span className="mono text-[10px]" style={{ color: 'var(--urgent)' }}>구글에서도 지움</span>
      <button type="submit" className="rounded-lg px-2 py-1 text-[11px]" style={{ background: 'var(--urgent)', color: '#fff' }}>
        삭제
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="rounded-lg px-2 py-1 text-[11px]"
        style={{ color: 'var(--ink-3)' }}
      >
        취소
      </button>
    </form>
  );
}

/**
 * 정리 모드 — 크롤러가 한꺼번에 밀어넣은 공고를 여러 개 골라 한 번에 치운다.
 * 지우기 전에 고른 개수와 제목을 보여줘서, 무엇이 사라지는지 모른 채 누르는 일이 없게 한다.
 */
export function CleanupMode({ events }: { events: CalendarEvent[] }) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const chosen = events.filter((e) => picked.includes(e.id));

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (!on) {
    return (
      <button
        type="button"
        onClick={() => setOn(true)}
        className="chip pressable"
        title="여러 일정을 골라 한 번에 지우기"
      >
        정리
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-2xl border p-3" style={{ borderColor: 'var(--urgent-line)', background: 'var(--surface)' }}>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="sec-label mb-0">정리 모드 — 지울 일정을 고르세요</p>
        <button
          type="button"
          onClick={() => { setOn(false); setPicked([]); setConfirming(false); }}
          className="t-cap underline"
        >
          닫기
        </button>
      </div>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {events.map((e) => {
          const d = new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(5, 10).replace('-', '/');
          return (
            <li key={e.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--line-soft)]">
                <input
                  type="checkbox"
                  checked={picked.includes(e.id)}
                  onChange={() => toggle(e.id)}
                  className="h-4 w-4 shrink-0"
                />
                <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--ink-4)' }}>{d}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{e.title}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {picked.length > 0 && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-2 w-full rounded-xl py-2 text-[13px] font-medium"
          style={{ background: 'var(--urgent)', color: '#fff' }}
        >
          {picked.length}건 삭제
        </button>
      )}

      {confirming && (
        <div className="mt-2 rounded-xl p-2.5" style={{ background: 'var(--urgent-bg, #FDF0EE)' }}>
          <p className="text-[12.5px] font-medium" style={{ color: 'var(--urgent)' }}>
            아래 {chosen.length}건을 구글 캘린더에서도 지웁니다. 앱에서는 되돌릴 수 없어요.
          </p>
          <ul className="my-1.5 max-h-28 space-y-0.5 overflow-y-auto">
            {chosen.map((e) => (
              <li key={e.id} className="truncate text-[12px]" style={{ color: 'var(--ink-2)' }}>· {e.title}</li>
            ))}
          </ul>
          <form action={deleteEvent} className="flex gap-1.5">
            {chosen.map((e) => <input key={e.id} type="hidden" name="id" value={e.id} />)}
            <button type="submit" className="flex-1 rounded-lg py-1.5 text-[12.5px] font-medium" style={{ background: 'var(--urgent)', color: '#fff' }}>
              네, 지웁니다
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-[12.5px]"
              style={{ color: 'var(--ink-3)' }}
            >
              취소
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
