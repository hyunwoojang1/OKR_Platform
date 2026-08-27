'use client';

import { useState } from 'react';
import { toggleEventDone, setEventDeadline, setEventKr } from '@/lib/actions';
import type { CalendarEvent } from '@/lib/types';

/** 일정에 연결할 수 있는 지표 — 목록에 필요한 만큼만. */
export type KrLite = { id: string; title: string; unit: string; goal: string; objectiveId: string | null };

/**
 * 달력 일정의 완료 동그라미.
 * 마감일이 아직 안 왔어도 지금 누를 수 있다 — 다음 주 서류를 오늘 다 냈으면 지금 끝내야지,
 * 마감일까지 기다렸다 누를 이유가 없다.
 */
export function EventCheck({ event, isDeadline }: { event: CalendarEvent; isDeadline: boolean }) {
  const done = Boolean(event.done_at);
  if (!isDeadline && !done) return null;

  return (
    <form action={toggleEventDone} className="flex shrink-0">
      <input type="hidden" name="id" value={event.id} />
      <input type="hidden" name="done" value={done ? 'false' : 'true'} />
      <button
        type="submit"
        aria-label={done ? `${event.title} 완료 되돌리기` : `${event.title} 다 했음`}
        title={done ? '되돌리기' : '다 했으면 지금 눌러도 돼요'}
        className={`check ${done ? 'on' : ''}`}
        style={done ? undefined : { borderColor: 'var(--urgent-line)' }}
      >
        {done ? '✓' : ''}
      </button>
    </form>
  );
}

/**
 * 일정 하나의 설정 — ⚙ 로 열린다.
 *
 * 두 가지를 한자리에서 정한다.
 *   ① 이게 마감이 맞나 — 제목 규칙은 짐작이라 반드시 틀리는 게 나온다.
 *      고칠 자리가 없으면 규칙이 감옥이 된다.
 *   ② 끝냈을 때 어느 지표가 오르나 — 이걸 안 걸어두면 체크가 취소선에서 끝나고
 *      "자소서 제출 3/12"는 영영 손으로 고쳐야 한다.
 */
export function EventOptions({
  event, guessed, krs,
}: { event: CalendarEvent; guessed: boolean; krs: KrLite[] }) {
  const [open, setOpen] = useState(false);
  const manual = event.is_deadline !== null && event.is_deadline !== undefined;
  const linked = krs.find((k) => k.id === event.key_result_id);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${event.title} 마감 여부·지표 바꾸기`}
        title={linked ? `끝내면 '${linked.title}'이(가) 오릅니다` : manual ? '내가 정한 값' : '제목으로 짐작한 값'}
        className="pressable shrink-0 text-[11px] opacity-30 hover:opacity-100"
        style={{ color: linked || manual ? 'var(--accent-deep)' : 'var(--ink-4)', opacity: linked ? 1 : undefined }}
      >
        {linked ? '◎' : '⚙'}
      </button>
    );
  }
  return (
    <div className="mt-1.5 w-full space-y-2 rounded-xl border p-2"
      style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)' }}>
      {/*
        '자동으로'(판정을 비워 규칙에 다시 맡기기) 버튼이 여기 있었는데 없앴다.
        마감 판정은 이제 일정이 들어오는 순간 원본 제목("🔴 마감 — 회사")을 보고 내리고,
        저장된 제목에서는 그 단서를 이미 뗐다. 그래서 "다시 규칙에 맡기기"는 되짚을 근거가
        없는 상태에서 규칙을 돌리는 셈이 된다 — 실제로 확인해보니 진짜 마감 9건이
        9건 모두 '마감 아님'으로 뒤집혔다. 100% 틀리는 버튼은 없는 편이 낫다.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-cap flex-1">
          {guessed ? '마감으로 보고 있어요' : '마감이 아닌 걸로 보고 있어요'}
        </span>
        <form action={setEventDeadline} className="flex gap-1.5">
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="is_deadline" value={guessed ? 'false' : 'true'} />
          <button type="submit" className="chip pressable !py-1 !text-[11.5px]">
            {guessed ? '마감 아님으로' : '마감으로'}
          </button>
        </form>
      </div>

      {krs.length > 0 && (
        <form action={setEventKr} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="id" value={event.id} />
          <span className="t-cap shrink-0">끝내면 오를 지표</span>
          <select
            name="key_result_id"
            defaultValue={event.key_result_id ?? ''}
            aria-label={`${event.title} 끝내면 오를 지표`}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="min-w-0 flex-1 rounded-lg border px-1.5 py-1 text-[11.5px]"
            style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)' }}
          >
            <option value="">연결 안 함</option>
            {krs.map((k) => (
              <option key={k.id} value={k.id}>{k.goal} · {k.title}</option>
            ))}
          </select>
        </form>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(false)} className="t-cap underline" style={{ color: 'var(--ink-3)' }}>
          닫기
        </button>
      </div>
    </div>
  );
}
