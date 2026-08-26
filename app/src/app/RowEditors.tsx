'use client';

import { useState } from 'react';
import { updateTask, deleteTask, updateHabit, deleteHabit, promoteTaskToRoutine } from '@/lib/actions';
import type { Area, DailyTask, Habit } from '@/lib/types';

/** 영역 고르는 컬러 칩 줄. select보다 손가락으로 누르기 쉽고 색이 바로 보인다. */
function AreaChips({ areas, value, onChange }: { areas: Area[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={() => onChange('')} className="chip !py-1 !text-[11px]"
        style={value === '' ? { borderColor: 'var(--ink)', color: 'var(--ink)' } : undefined}>
        없음
      </button>
      {areas.map((a) => (
        <button key={a.id} type="button" onClick={() => onChange(a.id)} className="chip !py-1 !text-[11px]"
          style={value === a.id ? { borderColor: a.color, color: a.color } : undefined}>
          <span className="area-dot" style={{ background: a.color }} />{a.name}
        </button>
      ))}
    </div>
  );
}

/** 여는 버튼 — 줄 오른쪽 끝의 작은 연필. */
function EditToggle({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="pressable shrink-0 text-[11px] opacity-25 hover:opacity-100" style={{ color: 'var(--ink-4)' }}>
      ✎
    </button>
  );
}

export function TaskEditor({ task, areas }: { task: DailyTask; areas: Area[] }) {
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState(task.area_id ?? '');
  const [confirming, setConfirming] = useState(false);

  if (!open) return <EditToggle onClick={() => setOpen(true)} label={`${task.title} 고치기`} />;

  return (
    <div className="mt-1.5 w-full rounded-xl border p-2.5" style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)' }}>
      <form action={async (fd) => { await updateTask(fd); setOpen(false); }} className="space-y-2">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="area_id" value={areaId} />
        <input name="title" defaultValue={task.title} required autoComplete="off"
          className="w-full rounded-lg border px-2 py-1.5 text-[14px]" style={{ borderColor: 'var(--line-strong)' }} />
        <div className="flex items-center gap-2">
          <label className="t-cap shrink-0">마감</label>
          <input type="date" name="due_date" defaultValue={task.due_date ?? ''}
            className="rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: 'var(--line-strong)' }} />
        </div>
        <AreaChips areas={areas} value={areaId} onChange={setAreaId} />
        <div className="flex items-center gap-1.5">
          <button type="submit" className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>저장</button>
          <button type="button" onClick={() => { setOpen(false); setConfirming(false); }}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>닫기</button>
          <span className="flex-1" />
          {!confirming && (
            <button type="button" onClick={() => setConfirming(true)}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ color: 'var(--urgent)' }}>삭제</button>
          )}
        </div>
      </form>

      {confirming && (
        <form action={deleteTask} className="mt-1.5 flex items-center gap-1.5 rounded-lg p-2" style={{ background: 'var(--line-soft)' }}>
          <input type="hidden" name="id" value={task.id} />
          <span className="t-cap flex-1">완료 기록도 같이 지워집니다</span>
          <button type="submit" className="rounded-lg px-2.5 py-1 text-[12px] font-medium"
            style={{ background: 'var(--urgent)', color: '#fff' }}>지웁니다</button>
          <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1 text-[12px]"
            style={{ color: 'var(--ink-3)' }}>취소</button>
        </form>
      )}

      {/* 반복하는 일이면 루틴으로 옮기는 게 맞다 — 이월이 안 쌓이고 주간 횟수가 붙는다 */}
      <form action={promoteTaskToRoutine} className="mt-1.5">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="target_per_week" value="7" />
        <button type="submit" className="t-cap underline" style={{ color: 'var(--ink-3)' }}>
          ↻ 반복하는 일이면 루틴으로 옮기기
        </button>
      </form>
    </div>
  );
}

export function HabitEditor({ habit, areas }: { habit: Habit; areas: Area[] }) {
  const [open, setOpen] = useState(false);
  const [areaId, setAreaId] = useState(habit.area_id ?? '');
  const [perWeek, setPerWeek] = useState(habit.target_per_week);
  const [confirming, setConfirming] = useState(false);

  if (!open) return <EditToggle onClick={() => setOpen(true)} label={`${habit.title} 고치기`} />;

  return (
    <div className="mt-1.5 w-full rounded-xl border p-2.5" style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)' }}>
      <form action={async (fd) => { await updateHabit(fd); setOpen(false); }} className="space-y-2">
        <input type="hidden" name="id" value={habit.id} />
        <input type="hidden" name="area_id" value={areaId} />
        <input type="hidden" name="target_per_week" value={perWeek} />
        <input name="title" defaultValue={habit.title} required autoComplete="off"
          className="w-full rounded-lg border px-2 py-1.5 text-[14px]" style={{ borderColor: 'var(--line-strong)' }} />
        <div>
          <p className="t-cap mb-1">일주일에 몇 번?</p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button key={n} type="button" onClick={() => setPerWeek(n)} className="chip !py-1 !text-[11px]"
                style={perWeek === n ? { borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : undefined}>
                {n === 7 ? '매일' : `주 ${n}회`}
              </button>
            ))}
          </div>
        </div>
        <AreaChips areas={areas} value={areaId} onChange={setAreaId} />
        <div className="flex items-center gap-1.5">
          <button type="submit" className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>저장</button>
          <button type="button" onClick={() => { setOpen(false); setConfirming(false); }}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ color: 'var(--ink-3)' }}>닫기</button>
          <span className="flex-1" />
          {!confirming && (
            <button type="button" onClick={() => setConfirming(true)}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ color: 'var(--urgent)' }}>삭제</button>
          )}
        </div>
      </form>

      {confirming && (
        <form action={deleteHabit} className="mt-1.5 flex items-center gap-1.5 rounded-lg p-2" style={{ background: 'var(--line-soft)' }}>
          <input type="hidden" name="id" value={habit.id} />
          <span className="t-cap flex-1">지금까지 체크한 기록도 사라집니다. 이 루틴을 세던 지표가 있으면 숫자가 줄어요.</span>
          <button type="submit" className="rounded-lg px-2.5 py-1 text-[12px] font-medium"
            style={{ background: 'var(--urgent)', color: '#fff' }}>지웁니다</button>
          <button type="button" onClick={() => setConfirming(false)} className="px-2 py-1 text-[12px]"
            style={{ color: 'var(--ink-3)' }}>취소</button>
        </form>
      )}
    </div>
  );
}
