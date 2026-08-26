import { toggleTask, toggleHabitLog, createTask, promoteTaskToRoutine } from '@/lib/actions';
import { TaskEditor, HabitEditor } from './RowEditors';
import { weekCountOf, streakOf } from '@/lib/queries';
import type { Area, DailyTask, Habit, HabitLog, Initiative, KeyResult, SessionLog } from '@/lib/types';
import KrRow from './KrRow';

function ddayLabel(due: string, today: string): { text: string; urgent: boolean } {
  const d = Math.round(
    (new Date(`${due}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86400_000,
  );
  if (d === 0) return { text: 'D-DAY', urgent: true };
  if (d < 0) return { text: `${-d}일 지남`, urgent: true };
  return { text: `D-${d}`, urgent: d <= 3 };
}

function Section({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="sec-label mb-0">{label}</p>
        {note && <span className="mono text-[10.5px]" style={{ color: 'var(--ink-4)' }}>{note}</span>}
      </div>
      <ul className="group">{children}</ul>
    </div>
  );
}

function TaskRow({ task, area, areas, today, showDue, repeatedDays }: {
  task: DailyTask; area?: Area; areas: Area[]; today: string; showDue?: boolean; repeatedDays?: number;
}) {
  const dd = showDue && task.due_date ? ddayLabel(task.due_date, today) : null;
  return (
    <li className="row flex-wrap" style={task.done ? { opacity: 0.55 } : undefined}>
      {area && <span className="row-bar" style={{ background: area.color }} />}
      <form action={toggleTask} className="flex">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="done" value={task.done ? 'false' : 'true'} />
        <button
          type="submit"
          aria-label={task.done ? `${task.title} 되돌리기` : `${task.title} 완료`}
          className={`check ${task.done ? 'on' : ''}`}
          style={!task.done && area ? { borderColor: area.color } : undefined}
        >
          {task.done ? '✓' : ''}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-medium ${task.done ? 'line-through' : ''}`}>{task.title}</p>
        <p className="t-cap flex gap-1.5">
          {area && <span style={{ color: area.color }}>{area.name}</span>}
          {task.carried_over > 0 && <span style={{ color: 'var(--warn)' }}>이월 {task.carried_over}회</span>}
        </p>
      </div>
      {dd && (
        <span className="mono shrink-0 text-[11px]" style={{ color: dd.urgent ? 'var(--urgent)' : 'var(--ink-4)' }}>
          {dd.text}
        </span>
      )}
      {/* 반복해서 끝낸 일이면 루틴으로 옮기자고 먼저 말을 건다 — 미리 '이건 루틴이야'라고 정할 필요를 없앤다. */}
      {repeatedDays ? (
        <form action={promoteTaskToRoutine} className="shrink-0">
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="target_per_week" value="7" />
          <button type="submit" title={`최근 ${repeatedDays}일 했어요 — 루틴으로 옮기면 이월이 쌓이지 않아요`}
            className="chip pressable !py-0.5 !text-[10.5px]"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent-deep)' }}>
            루틴으로?
          </button>
        </form>
      ) : null}
      <TaskEditor task={task} areas={areas} />
    </li>
  );
}

type Props = {
  date: string;
  tasks: DailyTask[];
  habits: Habit[];
  habitLogs: HabitLog[];
  weekInitiatives: Initiative[];
  areas: Area[];
  repeated: Record<string, number>;
  dailyKrs: KeyResult[];
  krWeekDone: Record<string, number>;
  krTodayLogs: Record<string, SessionLog[]>;
};

export default function TodayTasks({ date, tasks, habits, habitLogs, weekInitiatives, areas, repeated, dailyKrs, krWeekDone, krTodayLogs }: Props) {
  const areaOf = (id: string | null) => areas.find((a) => a.id === id);
  const habitLogOf = (id: string) => habitLogs.find((l) => l.habit_id === id && l.date === date && l.done);

  // 구역 나누기 — 성격이 다른 일을 한 줄에 섞지 않는다.
  //   마감·제출: 기한이 박힌 일 / 목표: 주간 계획에서 내려온 일 / 그 외: 직접 적은 일
  //   루틴은 할일 테이블이 아니라 루틴 테이블(habits)에서 온다 — 날짜별 체크라 이월이 쌓이지 않는다.
  const goalTasks = tasks.filter((x) => x.initiative_id);
  const deadlineTasks = tasks
    .filter((x) => !x.initiative_id && x.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const otherTasks = tasks.filter((x) => !x.initiative_id && !x.due_date);

  const krDoneCount = dailyKrs.filter((k) => (krTodayLogs[k.id] ?? []).length > 0).length;
  const doneCount = tasks.filter((x) => x.done).length + habits.filter((h) => habitLogOf(h.id)).length + krDoneCount;
  const totalCount = tasks.length + habits.length + dailyKrs.length;

  return (
    <section className="tile rise min-w-0 lg:col-span-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="tile-title mb-0">오늘 할일</h2>
        <span className="t-cap">{doneCount}/{totalCount}</span>
      </div>

      {totalCount === 0 && <p className="t-sub py-4 text-center">＋ 버튼으로 오늘을 설계해보세요</p>}

      {deadlineTasks.length > 0 && (
        <Section label="마감·제출">
          {deadlineTasks.map((task) => <TaskRow key={task.id} task={task} area={areaOf(task.area_id)} areas={areas} today={date} showDue repeatedDays={repeated[task.title]} />)}
        </Section>
      )}

      {(dailyKrs.length > 0 || habits.length > 0) && (
        <Section label="루틴" note="이번 주">
          {dailyKrs.map((kr) => (
            <KrRow
              key={kr.id}
              kr={kr}
              color={'var(--accent)'}
              weekDone={krWeekDone[kr.id] ?? 0}
              todayLogs={krTodayLogs[kr.id] ?? []}
            />
          ))}
          {habits.map((habit) => {
            const area = areaOf(habit.area_id);
            const color = area?.color ?? 'var(--ink-4)';
            const log = habitLogOf(habit.id);
            const done = Boolean(log);
            const week = weekCountOf(habit.id, habitLogs);
            const target = habit.target_per_week;
            const filled = week >= target; // 이번 주 목표를 채웠으면 더 눌러도 되고 안 눌러도 된다
            const streak = streakOf(habit.id, habitLogs);
            return (
              <li key={habit.id} className="row flex-wrap" style={filled && !done ? { opacity: 0.45 } : undefined}>
                <span className="row-bar" style={{ background: color }} />
                <form action={toggleHabitLog} className="flex">
                  <input type="hidden" name="habit_id" value={habit.id} />
                  <input type="hidden" name="date" value={date} />
                  <input type="hidden" name="done" value={done ? 'false' : 'true'} />
                  <button
                    type="submit"
                    aria-label={done ? `${habit.title} 되돌리기` : `${habit.title} 완료`}
                    className={`check ${done ? 'on' : ''}`}
                    style={done ? { background: color, borderColor: color } : { borderColor: color }}
                  >
                    {done ? '✓' : ''}
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[14px] font-medium ${done ? 'line-through' : ''}`}>{habit.title}</p>
                  {done ? (
                    <p className="t-cap" style={{ color: 'var(--accent-deep)' }}>
                      └ 이번주 {week}/{target} {filled ? '채움' : ''}{streak > 1 ? ` · 🔥${streak}일` : ''}
                    </p>
                  ) : (
                    <p className="t-cap">{filled ? '이번 주 목표 달성 · 더 해도 좋아요' : `${target - week}번 남았어요`}</p>
                  )}
                </div>
                <span className="mono shrink-0 text-[11px]" style={{ color: filled ? 'var(--up)' : 'var(--ink-4)' }}>
                  {week}/{target}
                </span>
                <HabitEditor habit={habit} areas={areas} />
              </li>
            );
          })}
        </Section>
      )}

      {goalTasks.length > 0 && (
        <Section label="이번 주 계획">
          {goalTasks.map((task) => <TaskRow key={task.id} task={task} area={areaOf(task.area_id)} areas={areas} today={date} repeatedDays={repeated[task.title]} />)}
        </Section>
      )}

      {otherTasks.length > 0 && (
        <Section label="그 외">
          {otherTasks.map((task) => <TaskRow key={task.id} task={task} area={areaOf(task.area_id)} areas={areas} today={date} repeatedDays={repeated[task.title]} />)}
        </Section>
      )}

      {/* 주간 계획 → 오늘로 내리기 (기존 동선 유지) */}
      {weekInitiatives.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
          <p className="sec-label mb-2">이번 주 할 일에서 가져오기</p>
          <ul className="flex flex-wrap gap-1.5">
            {weekInitiatives.map((ini) => {
              const area = areaOf(ini.area_id);
              return (
                <li key={ini.id}>
                  <form action={createTask}>
                    <input type="hidden" name="title" value={ini.title} />
                    <input type="hidden" name="area_id" value={ini.area_id ?? ''} />
                    <input type="hidden" name="initiative_id" value={ini.id} />
                    <button type="submit" className="chip pressable" title="오늘 할일로 내리기">
                      {area && <span className="area-dot" style={{ background: area.color }} />}
                      {ini.priority === 1 && '⚡'}{ini.title}
                      <span style={{ color: 'var(--ink-4)' }}>↴</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
