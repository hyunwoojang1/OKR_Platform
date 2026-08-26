import { toggleHabitLog } from '@/lib/actions';
import { HabitEditor } from './RowEditors';
import { weekCountOf, streakOf } from '@/lib/queries';
import type { Area, Habit, HabitLog, KeyResult, SessionLog } from '@/lib/types';
import KrRow from './KrRow';

/**
 * 루틴 — 여러 번에 걸쳐 채워가는 것들.
 *
 * 여기서 체크(✓)와 취소선의 뜻이 오늘 할일과 다르다.
 *   오늘 할일: 내가 눌러서 끝냈다
 *   루틴:      목표치를 다 채웠다 (자동으로 켜진다. 누르는 버튼이 아니다)
 *
 * 그래서 "자기소개서 제출 1/12" 은 체크가 안 된다. 오늘 한 건은 오늘 할일 박스에
 * 완료된 줄로 내려가 있고, 여기서는 12를 채워야 비로소 ✓ 가 켜진다.
 * 예전엔 오늘 한 번만 기록해도 여기에 ✓ 가 켜져서 "체크됐는데 왜 1/12?" 가 됐다.
 *
 * 왼쪽 = 상태(자동), 오른쪽 = 행동(오늘 기록하기). 이 둘을 섞지 않는다.
 */

/** 채움 상태 표시. 목표를 채우면 ✓, 아니면 남은 만큼 비어 있다. */
function FillMark({ filled, color }: { filled: boolean; color: string }) {
  return (
    <span
      className={`check ${filled ? 'on' : ''}`}
      aria-hidden
      style={filled
        ? { background: color, borderColor: color }
        : { borderColor: 'var(--line-strong)', borderStyle: 'dashed' }}
    >
      {filled ? '✓' : ''}
    </span>
  );
}

export default function RoutineBox({ date, habits, habitLogs, areas, dailyKrs, krWeekDone, krTodayLogs }: {
  date: string;
  habits: Habit[];
  habitLogs: HabitLog[];
  areas: Area[];
  dailyKrs: KeyResult[];
  krWeekDone: Record<string, number>;
  krTodayLogs: Record<string, SessionLog[]>;
}) {
  if (habits.length === 0 && dailyKrs.length === 0) return null;

  const areaOf = (id: string | null) => areas.find((a) => a.id === id);
  const habitLogOf = (id: string) => habitLogs.find((l) => l.habit_id === id && l.date === date && l.done);

  const habitFilled = habits.filter((h) => weekCountOf(h.id, habitLogs) >= h.target_per_week).length;
  // 목표치가 없는 지표(내용형 — "지원한 회사명" 처럼 적어서 쌓는 것)는 '채움' 이라는 개념이 없다.
  // 분모에 넣으면 아무리 꾸준히 적어도 영원히 못 채운 것처럼 보인다.
  const countable = dailyKrs.filter((k) => k.target_value != null);
  const krFilled = countable.filter((k) => (krWeekDone[k.id] ?? 0) >= Number(k.target_value)).length;
  const total = habits.length + countable.length;

  return (
    <section className="tile rise min-w-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="tile-title mb-0">루틴</h2>
        <span className="t-cap">{habitFilled + krFilled}/{total} 채움</span>
      </div>

      <ul className="group">
        {habits.map((habit) => {
          const area = areaOf(habit.area_id);
          const color = area?.color ?? 'var(--accent)';
          const doneToday = Boolean(habitLogOf(habit.id));
          const week = weekCountOf(habit.id, habitLogs);
          const target = habit.target_per_week;
          const filled = week >= target;
          const streak = streakOf(habit.id, habitLogs);
          return (
            <li key={habit.id} className="row flex-wrap" style={filled ? { opacity: 0.62 } : undefined}>
              <span className="row-bar" style={{ background: color }} />
              <FillMark filled={filled} color={color} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[14px] font-medium ${filled ? 'line-through' : ''}`}>{habit.title}</p>
                <p className="t-cap truncate">
                  {filled
                    ? `이번 주 다 채웠어요${streak > 1 ? ` · 🔥${streak}일` : ''}`
                    : `${target - week}번 더${streak > 1 ? ` · 🔥${streak}일` : ''}`}
                </p>
              </div>
              <span className="mono shrink-0 text-[11px]" style={{ color: filled ? 'var(--accent-deep)' : 'var(--ink-4)' }}>
                {week}/{target}
              </span>
              {/* 오른쪽 = 행동. 오늘 이미 했으면 되돌리기는 '오늘 할일' 쪽에서 한다. */}
              {doneToday ? (
                <span className="t-cap shrink-0" style={{ color: 'var(--accent-deep)' }}>오늘 함</span>
              ) : (
                <form action={toggleHabitLog} className="shrink-0">
                  <input type="hidden" name="habit_id" value={habit.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="done" value="true" />
                  <button type="submit" aria-label={`${habit.title} 오늘 했음`}
                    className="chip pressable !py-0.5 !text-[11px]"
                    style={{ borderColor: color, color }}>＋ 오늘</button>
                </form>
              )}
              <HabitEditor habit={habit} areas={areas} />
            </li>
          );
        })}

        {dailyKrs.map((kr) => (
          <KrRow
            key={kr.id}
            kr={kr}
            color="var(--accent)"
            done={krWeekDone[kr.id] ?? 0}
            todayLogs={krTodayLogs[kr.id] ?? []}
          />
        ))}
      </ul>
    </section>
  );
}
