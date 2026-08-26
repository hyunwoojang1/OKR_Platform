import { toggleTask, toggleHabitLog, createTask, promoteTaskToRoutine, undoKrProgress } from '@/lib/actions';
import { TaskEditor } from './RowEditors';
import type { Area, DailyTask, Habit, HabitLog, Initiative, KeyResult, SessionLog } from '@/lib/types';
import { krUnit } from '@/lib/types';

/**
 * 오늘 할일 — 오늘 한 번 하고 끝나는 것들.
 *
 * 체크의 뜻: 내가 눌러서 끝냈다. 누르면 취소선.
 * 루틴(반복해서 채우는 것)과 마감(기한이 박힌 것)은 각자 다른 박스에 산다 —
 * 성격이 다른 셋을 한 상자에 넣으면 "오늘 뭘 하면 되지"가 안 읽힌다.
 *
 * 그리고 오늘 루틴·지표에서 해낸 것도 여기 완료된 줄로 내려온다.
 * 이 박스를 보면 "오늘 내가 해낸 것"이 한눈에 보여야 하기 때문이다.
 * 누적(3/12 같은 것)은 루틴 박스가 맡는다.
 */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="sec-label mb-1">{label}</p>
      <ul className="group">{children}</ul>
    </div>
  );
}

function TaskRow({ task, area, areas, repeatedDays }: {
  task: DailyTask; area?: Area; areas: Area[]; repeatedDays?: number;
}) {
  const shown = task.title;
  return (
    <li className="row flex-wrap" style={task.done ? { opacity: 0.55 } : undefined}>
      {area && <span className="row-bar" style={{ background: area.color }} />}
      <form action={toggleTask} className="flex">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="done" value={task.done ? 'false' : 'true'} />
        <button
          type="submit"
          aria-label={task.done ? `${shown} 되돌리기` : `${shown} 완료`}
          className={`check ${task.done ? 'on' : ''}`}
          style={!task.done && area ? { borderColor: area.color } : undefined}
        >
          {task.done ? '✓' : ''}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-medium ${task.done ? 'line-through' : ''}`}>{shown}</p>
        <p className="t-cap flex gap-1.5">
          {area && <span style={{ color: area.color }}>{area.name}</span>}
          {task.carried_over > 0 && <span style={{ color: 'var(--ink-3)' }}>이월 {task.carried_over}회</span>}
        </p>
      </div>
      {/* 반복해서 끝낸 일이면 루틴으로 옮기자고 먼저 말을 건다. */}
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

/** 오늘 루틴·지표에서 해낸 한 줄. 항상 완료 상태이고, 되돌리기만 붙는다. */
function DoneRow({ title, caption, color, undo }: {
  title: string; caption: string; color: string; undo: React.ReactNode;
}) {
  return (
    <li className="row flex-wrap" style={{ opacity: 0.62 }}>
      <span className="row-bar" style={{ background: color }} />
      <span className="check on" aria-hidden style={{ background: color, borderColor: color }}>✓</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium line-through">{title}</p>
        <p className="t-cap truncate">{caption}</p>
      </div>
      {undo}
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
  krTodayLogs: Record<string, SessionLog[]>;
};

export default function TodayTasks({
  date, tasks, habits, habitLogs, weekInitiatives, areas, repeated, dailyKrs, krTodayLogs,
}: Props) {
  const areaOf = (id: string | null) => areas.find((a) => a.id === id);

  // 임박한 마감은 '마감·제출' 박스가 가져간다(page.tsx 에서 갈라서 넘어온다).
  // 여기 남는 건 오늘 한 번 하고 끝나는 것들.
  const goalTasks = tasks.filter((x) => x.initiative_id);
  const plainTasks = tasks.filter((x) => !x.initiative_id);

  // 오늘 루틴에서 체크한 것
  const habitDone = habits
    .map((h) => ({ habit: h, log: habitLogs.find((l) => l.habit_id === h.id && l.date === date && l.done) }))
    .filter((x) => x.log);

  // 오늘 지표에 기록한 것 — 한 건씩 따로 보여준다("우리자산운용" 처럼 무엇을 했는지가 남는다)
  const krDone = dailyKrs.flatMap((kr) =>
    (krTodayLogs[kr.id] ?? []).map((log) => ({ kr, log })));

  const doneItems = habitDone.length + krDone.length;
  const total = tasks.length + doneItems;
  const done = tasks.filter((x) => x.done).length + doneItems;

  return (
    <section className="tile rise min-w-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="tile-title mb-0">오늘 할일</h2>
        <span className="t-cap">{done}/{total}</span>
      </div>

      {total === 0 && <p className="t-sub py-4 text-center">＋ 버튼으로 오늘을 설계해보세요</p>}

      {plainTasks.length > 0 && (
        <Section label="할 일">
          {plainTasks.map((task) => (
            <TaskRow key={task.id} task={task} area={areaOf(task.area_id)} areas={areas} repeatedDays={repeated[task.title]} />
          ))}
        </Section>
      )}

      {goalTasks.length > 0 && (
        <Section label="이번 주 계획에서">
          {goalTasks.map((task) => (
            <TaskRow key={task.id} task={task} area={areaOf(task.area_id)} areas={areas} repeatedDays={repeated[task.title]} />
          ))}
        </Section>
      )}

      {doneItems > 0 && (
        <Section label="오늘 해낸 것">
          {krDone.map(({ kr, log }) => (
            <DoneRow
              key={log.id}
              title={kr.title}
              caption={log.note && log.note !== kr.title
                ? log.note
                : `${Math.round((log.metrics?.[0]?.v ?? 1) * 100) / 100}${krUnit(kr)}`}
              color="var(--accent)"
              undo={(
                <form action={undoKrProgress} className="shrink-0">
                  <input type="hidden" name="log_id" value={log.id} />
                  <button type="submit" className="t-cap underline" style={{ color: 'var(--ink-3)' }}>되돌리기</button>
                </form>
              )}
            />
          ))}
          {habitDone.map(({ habit }) => {
            const color = areaOf(habit.area_id)?.color ?? 'var(--accent)';
            return (
              <DoneRow
                key={habit.id}
                title={habit.title}
                caption="루틴"
                color={color}
                undo={(
                  <form action={toggleHabitLog} className="shrink-0">
                    <input type="hidden" name="habit_id" value={habit.id} />
                    <input type="hidden" name="date" value={date} />
                    <input type="hidden" name="done" value="false" />
                    <button type="submit" className="t-cap underline" style={{ color: 'var(--ink-3)' }}>되돌리기</button>
                  </form>
                )}
              />
            );
          })}
        </Section>
      )}

      {/* 주간 계획 → 오늘로 내리기 */}
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
