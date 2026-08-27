'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  createSeasonState, updateSeasonState, deleteSeason, setEventSeason, seedSeasons,
} from '@/lib/actions';
import type { ActionState } from '@/lib/form';
import type { SeasonLite } from '@/lib/deadline';

export type EventLite = {
  id: string;
  title: string;
  /** KST 날짜 (YYYY-MM-DD) */
  date: string;
  dday: number;
  done: boolean;
  /** 이 폴더에 손으로 넣은 것인가 (자동 배정과 구분해 보여준다) */
  manual: boolean;
  /** 제목이 자격증으로 보이는가 — 폴더가 아직 없을 때 왜 나눠야 하는지 설명하는 데 쓴다 */
  cert: boolean;
};

export type Group = {
  /** null = 어느 폴더에도 안 걸린 것 */
  season: SeasonLite | null;
  past: EventLite[];
  upcoming: number;
};

function fmtRange(s: SeasonLite): string {
  if (!s.starts_on && !s.ends_on) return '기간 없음 · 이름으로만';
  const cut = (d: string | null) => (d ? d.slice(2).replace(/-/g, '.') : '');
  return `${cut(s.starts_on)} – ${cut(s.ends_on)}`;
}

const INPUT = 'w-full rounded-lg border px-2 py-1.5 text-[14px]';
const INPUT_STYLE = { borderColor: 'var(--line-strong)' } as const;

/**
 * 시즌 하나를 만들거나 고치는 폼. 만들기와 고치기가 칸이 같아서 한 컴포넌트로 둔다.
 *
 * 실패하면 그 자리에 한국어로 말한다. 예전엔 성공·실패와 무관하게 폼을 닫아버려서
 * 오류가 증발했고, 그 사이 화면 전체가 영어 오류 페이지로 대체돼 쓰던 내용까지 날아갔다.
 */
function SeasonForm({
  season, onDone,
}: { season: SeasonLite | null; onDone: () => void }) {
  const action = season ? updateSeasonState : createSeasonState;
  const [state, submit, pending] = useActionState<ActionState, FormData>(action, null);

  // 성공했을 때만 닫는다 — 실패했는데 닫으면 무엇이 잘못됐는지 볼 자리가 없어진다.
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);

  return (
    <form
      action={submit}
      className="mt-2 space-y-2 rounded-xl border p-2.5"
      style={{ borderColor: 'var(--line-strong)', background: 'var(--surface)' }}
    >
      {season && <input type="hidden" name="id" value={season.id} />}
      <input name="name" defaultValue={season?.name ?? ''} required autoComplete="off"
        placeholder="폴더 이름 (예: 2026 하반기 공채)" className={INPUT} style={INPUT_STYLE} />
      <div className="flex items-center gap-2">
        <input type="date" name="starts_on" defaultValue={season?.starts_on ?? ''} aria-label="시작일"
          className={INPUT} style={INPUT_STYLE} />
        <span className="t-cap shrink-0">–</span>
        <input type="date" name="ends_on" defaultValue={season?.ends_on ?? ''} aria-label="종료일"
          className={INPUT} style={INPUT_STYLE} />
      </div>
      <textarea name="keywords" defaultValue={(season?.keywords ?? []).join(', ')} rows={2}
        placeholder="가르는 말 (쉼표로 구분 — 예: 마감, 공채, 신입)"
        className={`${INPUT} resize-y`} style={INPUT_STYLE} />
      <p className="t-cap">
        제목에 이 말이 하나라도 있으면 이 폴더로 갑니다. 기간보다 말이 먼저예요 —
        9월에 공채와 자격증이 겹치면 날짜로는 못 가르거든요.
      </p>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg px-2.5 py-2 text-[13px]"
          style={{ background: 'var(--urgent-line)', color: 'var(--ink)' }}>
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--ink)', color: '#fff', opacity: pending ? 0.55 : 1 }}>
          {pending ? '저장 중…' : season ? '저장' : '폴더 만들기'}
        </button>
        <button type="button" onClick={onDone} className="t-cap underline">취소</button>
      </div>
    </form>
  );
}

/**
 * 마감 한 줄 — 날짜·제목·제출 여부, 그리고 다른 폴더로 옮기는 칸.
 *
 * 폴더 선택 칸은 좀은 화면에서 아랫줄로 내린다. 한 줄에 까려 넣으면
 * 375px에서 제목이 '...'만 남아—지원 이력인데 뭐를 냈는지가 안 보인다.
 */
function EventRow({ event, seasons, currentId }: { event: EventLite; seasons: SeasonLite[]; currentId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5">
      <span className="mono w-11 shrink-0 text-[11px]" style={{ color: 'var(--ink-3)' }}>
        {event.date.slice(5).replace('-', '/')}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[14px] ${event.done ? 'line-through' : ''}`}
        style={{ color: event.done ? 'var(--ink-3)' : 'var(--ink)' }}
      >
        {event.done ? '✓ ' : ''}{event.title}
      </span>
      {!event.done && (
        <span className="badge badge-urgent shrink-0 whitespace-nowrap" title="완료로 찍지 않고 지나간 마감">놓침</span>
      )}
      {event.manual && <span className="t-cap shrink-0" title="손으로 이 폴더에 넣음">📍</span>}
      {seasons.length > 0 && (
        <form action={setEventSeason} className="w-full pl-[52px] sm:w-auto sm:shrink-0 sm:pl-0">
          <input type="hidden" name="id" value={event.id} />
          <select
            name="season_id"
            defaultValue={currentId}
            aria-label={`${event.title} 폴더 옮기기`}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="max-w-full rounded-lg border px-1.5 py-0.5 text-[11px] sm:w-36"
            style={{ borderColor: 'var(--line)', color: 'var(--ink-3)', background: 'var(--surface)' }}
          >
            <option value="">자동 / 미분류</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </form>
      )}
    </div>
  );
}

function GroupCard({ group, seasons }: { group: Group; seasons: SeasonLite[] }) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(true);
  const s = group.season;
  const done = group.past.filter((e) => e.done).length;

  if (!s && group.past.length === 0 && group.upcoming === 0) return null;

  return (
    <section className="tile !p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <button type="button" onClick={() => setOpen(!open)} className="pressable text-[15px] font-medium">
          {open ? '▾' : '▸'} {s ? s.name : '미분류'}
        </button>
        <span className="t-cap flex-1">{s ? fmtRange(s) : '아직 어느 폴더에도 안 걸린 마감'}</span>
        {s && (
          <button type="button" onClick={() => setEditing(!editing)} className="t-cap underline">
            {editing ? '닫기' : '고치기'}
          </button>
        )}
      </div>

      <div className="mono mt-1 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
        지난 {group.past.length} · 제출 {done}
        {group.upcoming > 0 && ` · 예정 ${group.upcoming}`}
      </div>

      {editing && s && (
        <>
          <SeasonForm season={s} onDone={() => setEditing(false)} />
          <form action={deleteSeason} className="mt-1.5">
            <input type="hidden" name="id" value={s.id} />
            <button type="submit" className="t-cap underline" style={{ color: 'var(--urgent)' }}>
              폴더 지우기 (일정은 안 지워집니다)
            </button>
          </form>
        </>
      )}

      {open && group.past.length > 0 && (
        <ul className="mt-1">
          {group.past.map((e, i) => (
            <li key={e.id}>
              {i > 0 && <div className="divider" />}
              <EventRow event={e} seasons={seasons} currentId={s?.id ?? ''} />
            </li>
          ))}
        </ul>
      )}
      {open && group.past.length === 0 && (
        <p className="t-cap mt-2">지나간 마감이 아직 없어요{group.upcoming > 0 ? ' — 예정만 있습니다' : ''}.</p>
      )}
    </section>
  );
}

export default function SeasonBoard({
  groups, seasons, today,
}: { groups: Group[]; seasons: SeasonLite[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const certCount = groups.flatMap((g) => g.past).filter((e) => e.cert).length;
  const half = Number(today.slice(5, 7)) >= 7 ? '하반기' : '상반기';

  return (
    <div className="space-y-3">
      {seasons.length === 0 && (
        <div className="tile !p-4">
          <p className="text-[14px] font-medium">아직 폴더가 없어요</p>
          <p className="t-sub mt-1">
            지난 마감이 한 줄로 쌓이면 나중에 못 찾습니다. 폴더로 나눠두면
            &ldquo;올 {half}에 몇 군데 넣었지&rdquo;에 바로 답이 나와요.
            {certCount > 0 && ` 지금 자격증으로 보이는 게 ${certCount}건 섞여 있습니다.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={seedSeasons}>
              <button type="submit" className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                공채 · 자격증으로 나누기
              </button>
            </form>
            <button type="button" onClick={() => setAdding(true)} className="t-cap underline">직접 만들기</button>
          </div>
        </div>
      )}

      {groups.map((g) => <GroupCard key={g.season?.id ?? '__none'} group={g} seasons={seasons} />)}

      {adding ? (
        <SeasonForm season={null} onDone={() => setAdding(false)} />
      ) : (
        seasons.length > 0 && (
          <button type="button" onClick={() => setAdding(true)} className="btn w-full !py-2.5 !text-[13.5px]">
            ＋ 폴더 만들기
          </button>
        )
      )}
    </div>
  );
}
