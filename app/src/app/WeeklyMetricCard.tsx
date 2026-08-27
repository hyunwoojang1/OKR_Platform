import { recordWeeklyMetric } from '@/lib/actions';
import type { KeyResult, SessionLog } from '@/lib/types';

/** 주 1회 재는 지표를 알아보는 말. 여기 걸리면 주말에 홈에서 바로 적을 수 있다. */
const WEEKLY_MEASURE = /몸무게|체중|체지방|weight/i;

/**
 * 토·일에만 띄운다. 주중에는 잴 일이 없어서 자리만 차지한다.
 * +9시간을 더하고 UTC 요일을 읽는 건 이 앱의 다른 날짜 계산과 같은 방식 —
 * 빼먹으면 한국 자정 기준이 전날 UTC라 요일이 하루씩 밀린다.
 */
export function isWeighInDay(dateStr: string): boolean {
  const dow = new Date(new Date(`${dateStr}T00:00:00+09:00`).getTime() + 9 * 3600_000).getUTCDay();
  return dow === 0 || dow === 6;
}

export function pickWeeklyMetrics(krs: KeyResult[]): KeyResult[] {
  return krs.filter((k) => WEEKLY_MEASURE.test(k.title));
}

export default function WeeklyMetricCard({ krs, logs }: { krs: KeyResult[]; logs: SessionLog[] }) {
  if (krs.length === 0) return null;

  return (
    <section className="tile rise">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="tile-title mb-0">이번 주 기록</h2>
        <span className="t-cap">주말에만 보여요</span>
      </div>
      <ul className="space-y-2.5">
        {krs.map((kr) => {
          // 지표는 지금 값만 들고 있어서, 지난번에 뭐라고 적었는지는 기록에서 찾는다.
          const past = logs
            .filter((l) => l.note?.startsWith(kr.title) && l.metrics?.length)
            .sort((a, b) => b.logged_at.localeCompare(a.logged_at));
          const last = past[0]?.metrics?.[0]?.v ?? null;
          const goingDown = kr.target_value != null && kr.target_value < kr.start_value;
          const diff = last == null ? null : Math.round((Number(kr.current_value) - last) * 100) / 100;
          return (
            <li key={kr.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{kr.title}</p>
                <p className="t-cap">
                  지금 {Number(kr.current_value)}{kr.unit}
                  {diff != null && diff !== 0 && (
                    <span style={{ color: (diff < 0) === goingDown ? 'var(--up)' : 'var(--warn)' }}>
                      {' · 지난 기록 대비 '}{diff > 0 ? '+' : ''}{diff}{kr.unit}
                    </span>
                  )}
                  {' · 목표 '}{kr.target_value}{kr.unit}
                </p>
              </div>
              <form action={recordWeeklyMetric} className="flex shrink-0 items-center gap-1.5">
                <input type="hidden" name="id" value={kr.id} />
                <input
                  name="value"
                  inputMode="decimal"
                  required
                  placeholder={String(kr.current_value)}
                  aria-label={`${kr.title} 새 기록`}
                  className="w-20 rounded-lg border px-2 py-1 text-right text-[14px]"
                  style={{ borderColor: 'var(--line-strong)' }}
                />
                <span className="t-cap">{kr.unit}</span>
                <button type="submit" className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>
                  기록
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
