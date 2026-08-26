'use client';

import { useState } from 'react';
import { logKrProgress } from '@/lib/actions';
import { fmtKrValue, krUnit, isPaceKr, type KeyResult, type SessionLog } from '@/lib/types';

/**
 * 루틴 박스의 지표 한 줄.
 *
 * 왼쪽 ✓ 는 **목표를 다 채웠다**는 표시다. 누르는 버튼이 아니다.
 * "오늘 한 번 기록했다"와 "12개를 다 채웠다"는 다른 말인데, 예전엔 둘 다 ✓ 로 보여서
 * "체크는 됐는데 왜 1/12?" 가 됐다.
 *
 * 오른쪽이 행동 자리 — 오늘 한 걸 여기서 적는다. 적은 결과는 '오늘 할일' 박스에
 * 완료된 줄로 내려간다.
 */
export default function KrRow({ kr, color, done, todayLogs }: {
  kr: KeyResult;
  color: string;
  /** 주간형이면 이번 주 실적, 최종형이면 전체 현재값 */
  done: number;
  /** 오늘 이 지표로 남긴 기록 */
  todayLogs: SessionLog[];
}) {
  const [open, setOpen] = useState(false);
  const target = kr.target_value == null ? null : Number(kr.target_value);
  const filled = target != null && done >= target;
  const unit = krUnit(kr);
  const todayCount = todayLogs.length;

  const caption = filled
    ? kr.cadence === 'weekly' ? '이번 주 다 채웠어요' : '목표를 다 채웠어요'
    : target == null
      ? '적은 내용이 기록으로 쌓여요'
      : `${Math.round((target - done) * 100) / 100}${unit} 더`;

  return (
    <li className="row flex-wrap" style={filled ? { opacity: 0.62 } : undefined}>
      <span className="row-bar" style={{ background: color }} />

      {/* 왼쪽 = 상태. 목표를 채우면 켜진다. */}
      <span
        className={`check ${filled ? 'on' : ''}`}
        aria-hidden
        style={filled
          ? { background: color, borderColor: color }
          : { borderColor: 'var(--line-strong)', borderStyle: 'dashed' }}
      >
        {filled ? '✓' : ''}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-medium ${filled ? 'line-through' : ''}`}>{kr.title}</p>
        <p className="t-cap truncate">
          {caption}
          {todayCount > 0 && <span style={{ color: 'var(--accent-deep)' }}> · 오늘 {todayCount}건</span>}
        </p>
      </div>

      {target != null && (
        <span className="mono shrink-0 text-[11px]" style={{ color: filled ? 'var(--accent-deep)' : 'var(--ink-4)' }}>
          {fmtKrValue(kr, done)}/{fmtKrValue(kr, target)}
        </span>
      )}

      {/* 오른쪽 = 행동. 완료만형은 톡 한 번, 숫자·내용형은 칸이 열린다. */}
      {kr.input_mode === 'check' ? (
        <form action={logKrProgress} className="shrink-0">
          <input type="hidden" name="id" value={kr.id} />
          <button type="submit" className="chip pressable !py-0.5 !text-[11px]"
            style={{ borderColor: color, color }}>＋ 오늘</button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(!open)}
          className="chip pressable shrink-0 !py-0.5 !text-[11px]"
          style={{ borderColor: color, color }}>
          {open ? '닫기' : '＋ 기록'}
        </button>
      )}

      {open && (
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
        </form>
      )}
    </li>
  );
}
