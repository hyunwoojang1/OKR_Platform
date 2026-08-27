'use client';

import { useState } from 'react';
import { logKrProgress, pullCodingFromNotion } from '@/lib/actions';
import { isCodingKr, krUnit, isPaceKr, krWeeklyTarget, type KeyResult } from '@/lib/types';

/**
 * 오늘 할일에 뜨는 지표 한 줄.
 *
 * 루틴 박스의 KrRow 와 왼쪽 동그라미의 뜻이 정반대라 부품을 나눴다.
 *   루틴 박스   — 왼쪽 ✓ 는 "이번 주 몫을 다 채웠다"는 상태 표시. 누르는 게 아니다.
 *   여기(오늘)  — 왼쪽 ○ 는 "지금 하겠다"는 버튼. 누르면 무엇을 했는지 묻는다.
 * 같은 부품에 두 뜻을 넣으면 반드시 한쪽이 틀린다.
 *
 * 숫자를 이름 옆에 안 붙인다. "이번 주에 뭘 해야 하나"를 보는 자리라
 * 8/20 같은 누적은 루틴 박스가 맡는다. 여기서는 이름만 보이고,
 * 얼마나 남았는지는 작은 글씨로만 거든다.
 *
 * 기록하고 나면 이 줄은 목록에서 빠지고 '오늘 해낸 것'으로 내려간다(되돌리기도 거기서).
 */
export default function TodayKrRow({ kr, color, weekDone }: {
  kr: KeyResult;
  color: string;
  /** 이번 주 실적 */
  weekDone: number;
}) {
  const [open, setOpen] = useState(false);
  const [pulled, setPulled] = useState<number | null>(null);
  const [pullMsg, setPullMsg] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const target = krWeeklyTarget(kr);
  const filled = target != null && weekDone >= target;
  const unit = krUnit(kr);
  const left = target == null ? null : Math.round((target - weekDone) * 100) / 100;
  const coding = isCodingKr(kr);

  // 이번 주 몫을 다 채웠으면 누를 것이 없다. 지운 게 아니라 해낸 거라 취소선으로 남긴다.
  if (filled) {
    return (
      <li className="row flex-wrap" style={{ opacity: 0.55 }}>
        <span className="row-bar" style={{ background: color }} />
        <span className="check on" aria-hidden style={{ background: color, borderColor: color }}>✓</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium line-through">{kr.title}</p>
          <p className="t-cap">이번 주 몫을 다 채웠어요</p>
        </div>
      </li>
    );
  }

  return (
    <li className="row flex-wrap">
      <span className="row-bar" style={{ background: color }} />

      {/* 완료만형은 톡 한 번으로 끝. 숫자·내용형은 무엇을 했는지 물어야 한다. */}
      {kr.input_mode === 'check' ? (
        <form action={logKrProgress} className="flex">
          <input type="hidden" name="id" value={kr.id} />
          <button type="submit" aria-label={`${kr.title} 오늘 했음`} className="check"
            style={{ borderColor: color }} />
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(!open)} className="check"
          aria-label={open ? `${kr.title} 입력 칸 닫기` : `${kr.title} 오늘 한 것 적기`}
          aria-expanded={open}
          style={{ borderColor: color }} />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{kr.title}</p>
        <p className="t-cap truncate">
          {left == null ? '쌓아가는 것' : `이번 주 ${left}${unit} 더`}
        </p>
      </div>

      {open && (
        <div className="mt-1.5 w-full space-y-1.5">
          <form action={logKrProgress} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={kr.id} />
            {kr.input_mode === 'number' ? (
              <>
                <input
                  name="amount"
                  autoFocus
                  required
                  defaultValue={pulled ?? undefined}
                  key={pulled ?? 'blank'}
                  inputMode={isPaceKr(kr) ? 'text' : 'decimal'}
                  placeholder={isPaceKr(kr) ? '예: 6:16' : '오늘 얼마나 했나요?'}
                  aria-label={`${kr.title} 오늘 한 양`}
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
                placeholder="무엇을 했나요? (예: 카카오뱅크)"
                aria-label={`${kr.title} 오늘 한 것`}
                className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-[14px]"
                style={{ borderColor: 'var(--line-strong)' }}
              />
            )}
            <button type="submit" aria-label={`${kr.title} 기록 저장`}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>기록</button>
          </form>

          {/*
            코테는 손으로 세는 게 아니라 노션 「푼 문제」가 정답이다.
            누르면 링크만 붙여둔 행을 채우고(제목·난이도·유형·날짜), 그중 날짜가 오늘인
            개수를 세어 위 칸에 넣는다. 더하는 게 아니라 갈아끼운다 — 5문제 풀고 한 번,
            3문제 더 풀고 또 누르면 8이 되어야지 13이 되면 안 된다.
          */}
          {coding && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pulling}
                aria-label={`${kr.title} 노션에서 오늘 푼 개수 가져오기`}
                onClick={async () => {
                  setPulling(true);
                  setPullMsg('노션을 읽고 문제를 채우는 중… 30초쯤 걸려요');
                  const r = await pullCodingFromNotion();
                  setPulling(false);
                  if (r.ok) {
                    setPulled(r.today);
                    setPullMsg(r.filled > 0
                      ? `${r.filled}개를 채웠어요 · 오늘 푼 것 ${r.today}문제`
                      : `오늘 푼 것 ${r.today}문제`);
                  } else {
                    setPullMsg(r.message);
                  }
                }}
                className="chip pressable !py-1 !text-[11.5px]"
                style={{ borderColor: color, color, opacity: pulling ? 0.5 : 1 }}
              >
                {pulling ? '가져오는 중…' : '노션에서 가져오기'}
              </button>
              {pullMsg && <span className="t-cap">{pullMsg}</span>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
