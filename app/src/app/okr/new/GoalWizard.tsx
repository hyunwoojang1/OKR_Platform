'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGoalPlan } from '@/lib/actions';
import type { Area } from '@/lib/types';

type KRDraft = { title: string; target: string; unit: string };

const WEEK_OPTIONS = [4, 6, 8];

function kstMondayPlus(weeks: number): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  const day = (now.getUTCDay() + 6) % 7;
  now.setUTCDate(now.getUTCDate() - day + weeks * 7);
  return now.toISOString().slice(0, 10);
}

// v4 새 목표 위저드: 질문 하나씩 → 마지막에 "이렇게 잡아봤어요" 검토 → 확정.
// AI는 제안, 확정은 사용자 — 확정 전엔 아무것도 저장되지 않는다.
export default function GoalWizard({ areas, upcomingCount }: { areas: Area[]; upcomingCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0); // 0제목 1영역·기한 2지표 3주별 → 4검토
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState<string>('');
  const [dueWeeks, setDueWeeks] = useState<number>(6);
  const [krs, setKrs] = useState<KRDraft[]>([
    { title: '', target: '', unit: '' },
    { title: '', target: '', unit: '' },
    { title: '', target: '', unit: '' },
  ]);
  const [weeks, setWeeks] = useState<string[]>(Array.from({ length: 6 }, () => ''));

  const dueDate = kstMondayPlus(dueWeeks);
  const canNext =
    step === 0 ? title.trim().length > 0
    : step === 1 ? !!areaId
    : step === 2 ? krs.some((k) => k.title.trim() && Number(k.target) > 0)
    : true;

  function setWeekCount(n: number) {
    setDueWeeks(n);
    setWeeks((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const id = await createGoalPlan({
          areaId,
          title,
          dueDate,
          krs: krs.map((k) => ({ title: k.title, target: Number(k.target), unit: k.unit })),
          weeks: weeks.map((w, i) => ({ weekOf: kstMondayPlus(i), title: w })),
        });
        router.push(`/okr/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했어요');
      }
    });
  }

  const stepLabel = step < 4 ? `새 목표 · ${step + 1}/4` : '확정 전 검토';

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-140px)] max-w-2xl flex-col">
      <div className="flex items-center justify-between pb-6">
        <button onClick={() => (step === 0 ? router.push('/okr') : setStep(step - 1))} className="text-sm" style={{ color: 'var(--ink-2)' }}>
          {step === 0 ? '✕' : '←'}
        </button>
        <span className="mono text-[11px] tracking-wide" style={{ color: 'var(--ink-3)' }}>{stepLabel}</span>
        {step === 2 || step === 3 ? (
          <button onClick={() => setStep(step + 1)} className="text-sm" style={{ color: 'var(--ink-4)' }}>건너뛰기</button>
        ) : (
          <span className="w-8" />
        )}
      </div>

      <div className="flex-1 space-y-7">
        {step === 0 && (
          <div className="space-y-5">
            <div className="text-xl font-medium leading-relaxed tracking-tight" style={{ textWrap: 'pretty' }}>
              무엇을 이루고 싶은지<br />한 줄로 알려주세요.
            </div>
            {upcomingCount > 0 && (
              <div className="text-sm" style={{ color: 'var(--ink-3)' }}>
                캘린더에 다가오는 일정 {upcomingCount}건이 있어요. 그걸 향한 목표여도 좋아요.
              </div>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 하반기 금융권 공채 합격"
              autoFocus
              className="w-full !rounded-3xl !px-5 !py-3.5"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-7">
            <div className="space-y-4">
              <div className="text-xl font-medium leading-relaxed tracking-tight">어느 영역의 목표인가요?</div>
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => {
                  const on = areaId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAreaId(a.id)}
                      className="rounded-xl px-4 py-3 text-[15px]"
                      style={
                        on
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', fontWeight: 500 }
                          : { border: '1px solid var(--line-strong)' }
                      }
                    >
                      {a.icon} {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-xl font-medium leading-relaxed tracking-tight">언제까지 해볼까요?</div>
              <div className="flex flex-col gap-2">
                {WEEK_OPTIONS.map((n) => {
                  const on = dueWeeks === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setWeekCount(n)}
                      className="flex items-center justify-between rounded-xl px-4 py-3.5"
                      style={
                        on
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)' }
                          : { border: '1px solid var(--line-strong)' }
                      }
                    >
                      <span className="text-[15px]" style={on ? { fontWeight: 500 } : undefined}>{n}주 동안</span>
                      <span className="mono text-xs" style={{ color: on ? 'var(--accent-deep)' : 'var(--ink-3)' }}>~{kstMondayPlus(n).slice(5).replace('-', '/')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="text-xl font-medium leading-relaxed tracking-tight" style={{ textWrap: 'pretty' }}>
              다 됐는지 아닌지,<br />무엇으로 판단할까요?
            </div>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              숫자로 셀 수 있는 것 1~3개면 충분해요. 예: 자기소개서 제출 12곳, 모의고사 75점.
            </div>
            <div className="flex flex-col gap-2.5">
              {krs.map((k, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={k.title}
                    onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    placeholder={i === 0 ? '무엇을 (예: 자기소개서 제출)' : '무엇을'}
                    className="min-w-0 flex-1"
                  />
                  <input
                    value={k.target}
                    onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
                    placeholder="목표"
                    inputMode="decimal"
                    className="mono w-16 text-right"
                  />
                  <input
                    value={k.unit}
                    onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                    placeholder="단위"
                    className="w-14"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="text-xl font-medium leading-relaxed tracking-tight" style={{ textWrap: 'pretty' }}>
              {dueWeeks}주를 어떻게 쓸지<br />주마다 한 줄씩 잡아볼까요?
            </div>
            <div className="text-sm" style={{ color: 'var(--ink-3)' }}>비워둔 주는 건너뜁니다. 나중에 채워도 돼요.</div>
            <div className="flex flex-col gap-2">
              {weeks.map((w, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="mono w-8 text-xs" style={{ color: 'var(--ink-3)' }}>{i + 1}주</span>
                  <input
                    value={w}
                    onChange={(e) => setWeeks(weeks.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={i === 0 ? '예: 지원할 곳 확정, 마감 캘린더 정리' : ''}
                    className="min-w-0 flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-[22px] font-medium tracking-tight">이렇게 잡아봤어요</div>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                이전 단계로 돌아가 고칠 수 있어요. 확정하면 오늘부터 목표에 올라옵니다.
              </div>
            </div>
            <div className="tile space-y-2">
              <div className="mono text-[11px] tracking-wide" style={{ color: 'var(--ink-3)' }}>
                {areas.find((a) => a.id === areaId)?.name} · {dueDate.slice(5).replace('-', '/')}까지
              </div>
              <div className="text-[19px] font-medium leading-snug tracking-tight">{title}</div>
            </div>
            {krs.some((k) => k.title.trim()) && (
              <div className="space-y-2.5">
                <div className="sec-label">이걸로 판단해요 · {krs.filter((k) => k.title.trim()).length}개</div>
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                  {krs.filter((k) => k.title.trim()).map((k, i) => (
                    <div key={i}>
                      {i > 0 && <div className="divider mx-4" />}
                      <div className="flex items-center justify-between px-4 py-[15px]">
                        <span className="text-[15px]">{k.title}</span>
                        <span className="mono text-[13px]" style={{ color: 'var(--ink-2)' }}>{k.target}{k.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weeks.some((w) => w.trim()) && (
              <div className="space-y-2.5">
                <div className="sec-label">주별 계획 · {dueWeeks}주</div>
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                  {weeks.map((w, i) => w.trim() && (
                    <div key={i}>
                      <div className="flex gap-3 px-4 py-[14px]">
                        <span className="mono w-7 pt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>{i + 1}주</span>
                        <span className="flex-1 text-[15px] leading-normal">{w}</span>
                      </div>
                      <div className="divider mx-4 last:hidden" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm" style={{ color: 'var(--urgent)' }}>{error}</p>}
          </div>
        )}
      </div>

      <div className="sticky bottom-[76px] flex gap-2.5 pb-2 pt-4 md:bottom-4" style={{ background: 'linear-gradient(rgba(250,249,245,0), var(--paper) 40%)' }}>
        {step < 4 ? (
          <button
            onClick={() => canNext && setStep(step + 1)}
            disabled={!canNext}
            className="btn-dark w-full rounded-[14px] py-3.5 text-center text-[16px] font-medium text-white disabled:opacity-30"
            style={{ background: 'var(--ink)' }}
          >
            다음
          </button>
        ) : (
          <>
            <button onClick={() => setStep(0)} className="btn rounded-[14px] px-5 py-3.5 text-[16px]">다시</button>
            <button
              onClick={submit}
              disabled={pending}
              className="flex-1 rounded-[14px] py-3.5 text-center text-[16px] font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {pending ? '만드는 중…' : '이걸로 시작'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
