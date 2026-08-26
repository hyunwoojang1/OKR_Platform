'use client';

import { useState } from 'react';
import { logKrProgress, undoKrProgress } from '@/lib/actions';
import { fmtKrValue, krUnit, isPaceKr, type KeyResult, type SessionLog } from '@/lib/types';

/**
 * 오늘 할일에 뜨는 지표 한 줄. 체크하면 지표가 그 자리에서 오른다.
 * 무엇을 받을지는 지표가 정한다 — 완료만은 톡 한 번, 숫자·내용은 칸이 열린다.
 */
export default function KrRow({
  kr,
  color,
  weekDone,
  todayLogs,
}: {
  kr: KeyResult;
  color: string;
  /** 주간형이면 이번 주 실적, 최종형이면 전체 현재값 */
  weekDone: number;
  /** 오늘 이 지표로 남긴 기록 — 되돌리기와 "오늘 얼마나 했나"의 근거 */
  todayLogs: SessionLog[];
}) {
  const [open, setOpen] = useState(false);
  const target = kr.target_value == null ? null : Number(kr.target_value);
  const filled = target != null && weekDone >= target;
  const doneToday = todayLogs.length > 0;

  const todayAmount = todayLogs.reduce((s, l) => s + (l.metrics?.[0]?.v ?? 0), 0);
  const unit = krUnit(kr);

  // 오늘 한 게 있으면 그걸 보여주고, 없으면 남은 양을 알려준다.
  const caption = doneToday
    ? kr.input_mode === 'text'
      ? todayLogs.map((l) => l.note).filter(Boolean).join(' · ')
      : `오늘 ${Math.round(todayAmount * 100) / 100}${unit}${target != null ? ` · ${kr.cadence === 'weekly' ? '이번주' : '최종'} ${fmtKrValue(kr, weekDone)}/${fmtKrValue(kr, target)}${unit}` : ''}`
    : target == null
      ? '적은 내용이 기록으로 쌓여요'
      : filled
        ? kr.cadence === 'weekly' ? '이번 주 목표 달성 · 더 해도 좋아요' : '목표 달성'
        : `${Math.round((target - weekDone) * 100) / 100}${unit} 남았어요`;

  return (
    <li className="row flex-wrap" style={filled && !doneToday ? { opacity: 0.5 } : undefined}>
      <span className="row-bar" style={{ background: color }} />

      {kr.input_mode === 'check' ? (
        <form action={logKrProgress} className="flex">
          <input type="hidden" name="id" value={kr.id} />
          <button
            type="submit"
            aria-label={`${kr.title} 한 번 더`}
            className={`check ${doneToday ? 'on' : ''}`}
            style={doneToday ? { background: color, borderColor: color } : { borderColor: color }}
          >
            {doneToday ? '✓' : ''}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={`${kr.title} 기록하기`}
          className={`check ${doneToday ? 'on' : ''}`}
          style={doneToday ? { background: color, borderColor: color } : { borderColor: color }}
        >
          {doneToday ? '✓' : ''}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-medium ${doneToday ? 'line-through' : ''}`}>{kr.title}</p>
        <p className="t-cap truncate" style={doneToday ? { color: 'var(--accent-deep)' } : undefined}>{caption}</p>
      </div>

      {target != null && (
        <span className="mono shrink-0 text-[11px]" style={{ color: filled ? 'var(--up)' : 'var(--ink-4)' }}>
          {fmtKrValue(kr, weekDone)}/{fmtKrValue(kr, target)}
        </span>
      )}
      {target == null && todayLogs.length > 0 && (
        <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--ink-4)' }}>{todayLogs.length}건</span>
      )}

      {/* 숫자·내용형: 체크를 누르면 이 줄 아래로 입력칸이 열린다 */}
      {open && !doneToday && (
        <form action={logKrProgress} className="mt-1.5 flex w-full items-center gap-1.5">
          <input type="hidden" name="id" value={kr.id} />
          {kr.input_mode === 'number' ? (
            <>
              <input
                name="amount"
                autoFocus
                required
                inputMode={isPaceKr(kr) ? 'text' : 'decimal'}
                placeholder={isPaceKr(kr) ? '예: 6:16' : '얼마나 했나요?'}
                className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
                style={{ borderColor: 'var(--line-strong)' }}
              />
              <span className="t-cap shrink-0">{unit}</span>
            </>
          ) : (
            <input
              name="note"
              autoFocus
              required
              placeholder="무엇을 했나요? (예: 우리자산운용)"
              className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
              style={{ borderColor: 'var(--line-strong)' }}
            />
          )}
          <button type="submit" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>기록</button>
          <button type="button" onClick={() => setOpen(false)} className="shrink-0 px-1.5 text-[12.5px]"
            style={{ color: 'var(--ink-3)' }}>취소</button>
        </form>
      )}

      {/* 오늘 찍은 게 있으면 하나씩 되돌릴 수 있다 */}
      {doneToday && (
        <div className="mt-1 flex w-full flex-wrap gap-1.5">
          {kr.input_mode !== 'check' && (
            <button type="button" onClick={() => setOpen(!open)} className="t-cap underline" style={{ color: 'var(--ink-3)' }}>
              ＋ 더 기록
            </button>
          )}
          <form action={undoKrProgress}>
            <input type="hidden" name="log_id" value={todayLogs[todayLogs.length - 1].id} />
            <button type="submit" className="t-cap underline" style={{ color: 'var(--ink-3)' }}>방금 것 되돌리기</button>
          </form>
        </div>
      )}

      {/* '더 기록'으로 다시 연 입력칸 */}
      {open && doneToday && (
        <form action={logKrProgress} className="mt-1.5 flex w-full items-center gap-1.5">
          <input type="hidden" name="id" value={kr.id} />
          {kr.input_mode === 'number' ? (
            <>
              <input name="amount" autoFocus required inputMode={isPaceKr(kr) ? 'text' : 'decimal'}
                placeholder="얼마나 더?" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
                style={{ borderColor: 'var(--line-strong)' }} />
              <span className="t-cap shrink-0">{unit}</span>
            </>
          ) : (
            <input name="note" autoFocus required placeholder="무엇을 더 했나요?"
              className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
              style={{ borderColor: 'var(--line-strong)' }} />
          )}
          <button type="submit" className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>기록</button>
          <button type="button" onClick={() => setOpen(false)} className="shrink-0 px-1.5 text-[12.5px]"
            style={{ color: 'var(--ink-3)' }}>취소</button>
        </form>
      )}
    </li>
  );
}
