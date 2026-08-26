import { toggleEventDone, toggleTask } from '@/lib/actions';
import { TaskEditor } from './RowEditors';
import { ddayOf } from '@/lib/deadline';
import type { Area, CalendarEvent, DailyTask } from '@/lib/types';

/**
 * 마감·제출 — 남이 정한 기한이 박힌 것들.
 *
 * 오늘 할일·루틴과 성격이 다르다. 이건 내가 고른 게 아니라 날짜가 정해준 일이라
 * 따로 서 있어야 "오늘 뭘 하면 되지"를 볼 때 숨이 안 막힌다.
 *
 * 색: 빨강을 안 쓴다. 달력에서 온 제목의 🔴 도 뗀다(cleanEventTitle).
 * 급한 건 색이 아니라 D-day 숫자와 굵기로 말한다 — 빨간 줄이 여러 개 서면
 * 다 급해 보여서 오히려 아무것도 안 급해 보인다.
 */

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

function dday(d: number): { text: string; strong: boolean } {
  if (d === 0) return { text: '오늘', strong: true };
  if (d < 0) return { text: `${-d}일 지남`, strong: true };
  return { text: `D-${d}`, strong: d <= 1 };
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="row flex-wrap">{children}</li>;
}

function DdayTag({ d }: { d: number }) {
  const { text, strong } = dday(d);
  // 'D-1' 은 숫자체(자간 넓음)가 어울리지만 '오늘'·'3일 지남' 은 한글이라 그러면 벌어져 보인다.
  const numeric = /^D-/.test(text);
  return (
    <span
      className={`${numeric ? 'mono ' : ''}shrink-0 whitespace-nowrap text-[11px]`}
      style={{ color: strong ? 'var(--ink)' : 'var(--ink-4)', fontWeight: strong ? 600 : 400 }}
    >
      {text}
    </span>
  );
}

export default function DeadlineBox({ date, events, tasks, areas }: {
  date: string;
  /** 달력에서 온 마감 (D-3 이내, 아직 안 끝낸 것) */
  events: CalendarEvent[];
  /** 마감일이 박힌 오늘 할일 */
  tasks: DailyTask[];
  areas: Area[];
}) {
  // 달력 마감을 완료하면 할일 한 줄과 지표 기록 한 줄이 같이 생긴다(toggleEventDone).
  // 둘 다 그리면 한 번 한 일을 두 곳에서 "해냈다"고 말하게 된다.
  // 지표 기록 쪽이 무엇을 했는지까지 담으므로 그쪽('오늘 해낸 것')에 맡기고 여기선 감춘다.
  const shown = tasks.filter((x) => !(x.done && x.source === 'job_posting' && x.key_result_id));
  const total = events.length + shown.length;
  if (total === 0) return null;

  const areaOf = (id: string | null) => areas.find((a) => a.id === id);
  const dueOf = (due: string) => Math.round(
    (new Date(`${due}T00:00:00+09:00`).getTime() - new Date(`${date}T00:00:00+09:00`).getTime()) / 86400_000,
  );

  return (
    <section className="tile rise min-w-0">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="tile-title mb-0">마감·제출</h2>
        <span className="t-cap">{total}건</span>
      </div>

      <ul className="group">
        {events.map((e) => {
          const title = e.title;
          const d = ddayOf(e.starts_at, date);
          return (
            <Row key={e.id}>
              <span className="row-bar" style={{ background: 'var(--ink-soft)' }} />
              <form action={toggleEventDone} className="flex">
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="done" value="true" />
                <button type="submit" aria-label={`${title} 다 했음`} className="check"
                  title="다 냈으면 지금 눌러도 돼요" />
              </form>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{title}</p>
                <p className="t-cap">{e.all_day ? '달력 · 종일' : `달력 · ${fmtTime(e.starts_at)}`}</p>
              </div>
              <DdayTag d={d} />
            </Row>
          );
        })}

        {shown.map((task) => {
          const area = areaOf(task.area_id);
          const shown = task.title;
          return (
            <li key={task.id} className="row flex-wrap" style={task.done ? { opacity: 0.55 } : undefined}>
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
                {area && <p className="t-cap" style={{ color: area.color }}>{area.name}</p>}
              </div>
              {task.due_date && <DdayTag d={dueOf(task.due_date)} />}
              <TaskEditor task={task} areas={areas} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
