'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setGoalStatus, updateGoalPlan } from '@/lib/actions';
import type { Area, Initiative, KeyResult, Objective } from '@/lib/types';
import { kstToday } from '@/lib/types';
import KrCard from '../../KrCard';
import { type KRDraft, MAX_KRS, isKrFilled, krSentence, parseAmount, toKrPayload, weeklyTargets } from '../../krDraft';

const MAX_WEEKS = 12;

function kstMondayPlus(weeks: number): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  const day = (now.getUTCDay() + 6) % 7;
  now.setUTCDate(now.getUTCDate() - day + weeks * 7);
  return now.toISOString().slice(0, 10);
}
function weeksUntil(date: string): number {
  const monday0 = new Date(`${kstMondayPlus(0)}T00:00:00+09:00`).getTime();
  const due = new Date(`${date}T00:00:00+09:00`).getTime();
  return Math.min(MAX_WEEKS, Math.max(1, Math.ceil((due - monday0) / (7 * 86400_000))));
}
function fmtMD(d: string): string {
  return d.slice(5).replace('-', '/');
}

// 편집 화면 = 위저드 4단계를 한 페이지에 세로로. 값이 채워진 채로 열린다.
export default function EditGoalForm({
  goal, krs: krRows, initiatives, areas,
}: {
  goal: Objective;
  krs: KeyResult[];
  initiatives: Initiative[];
  areas: Area[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = kstToday();
  const thisMonday = kstMondayPlus(0);

  const [title, setTitle] = useState(goal.title);
  const [areaId, setAreaId] = useState(goal.area_id);
  const [dueDate, setDueDate] = useState(goal.due_date ?? '');

  // DB값 → 입력 원문. start_value가 0이면 "현재 상태 안 씀"으로 본다.
  const [krs, setKrs] = useState<KRDraft[]>(() =>
    krRows.map((k) => ({
      id: k.id,
      title: k.title,
      target: `${Number(k.target_value)}${k.unit ?? ''}`,
      unit: k.unit ?? '',
      start: Number(k.start_value) > 0 ? `${Number(k.start_value)}${k.unit ?? ''}` : undefined,
      cadence: k.cadence ?? 'total',
      mode: k.input_mode ?? undefined,
    })),
  );

  const weekCount = dueDate && dueDate > today ? weeksUntil(dueDate) : Math.max(1, initiatives.length || 6);
  // 이번 주부터 앞으로만 편집한다 — 지난 주 계획은 기록이라 건드리지 않는다.
  const pastWeeks = useMemo(() => initiatives.filter((i) => i.week_of < thisMonday), [initiatives, thisMonday]);
  const [weeks, setWeeks] = useState<string[]>(() =>
    Array.from({ length: MAX_WEEKS }, (_, i) => initiatives.find((x) => x.week_of === kstMondayPlus(i))?.title ?? ''),
  );

  const removedKrs = krRows.filter((r) => !krs.some((k) => k.id === r.id));

  function updateKr(i: number, patch: Partial<KRDraft>) {
    setKrs((prev) => prev.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  }

  function removeKr(i: number) {
    const k = krs[i];
    const row = krRows.find((r) => r.id === k.id);
    const progress = row ? Number(row.current_value) : 0;
    if (row && progress > 0) {
      const ok = window.confirm(`「${row.title}」에 쌓인 ${progress}${row.unit} 진행값이 사라집니다.\n러닝 기록 같은 활동 기록은 그대로 남아요.\n지울까요?`);
      if (!ok) return;
    }
    setKrs((prev) => prev.filter((_, j) => j !== i));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateGoalPlan({
          id: goal.id,
          areaId,
          title,
          dueDate: dueDate || null,
          krs: krs.filter(isKrFilled).map(toKrPayload),
          weeks: weeks.slice(0, weekCount).map((w, i) => ({ weekOf: kstMondayPlus(i), title: w })),
        });
        router.push(`/okr/${goal.id}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했어요');
      }
    });
  }

  function finish(status: 'done' | 'dropped') {
    const label = status === 'done' ? '완료' : '그만두기';
    if (!window.confirm(`이 목표를 ${label} 처리할까요?\n목록에서 내려가고 기록은 그대로 남습니다.`)) return;
    startTransition(async () => {
      try {
        await setGoalStatus({ id: goal.id, status });
        router.push('/okr');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : '처리에 실패했어요');
      }
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-7 pb-28">
      <div className="flex items-center justify-between">
        <Link href={`/okr/${goal.id}`} className="text-sm" style={{ color: 'var(--ink-2)' }}>← 목표로</Link>
        <span className="mono text-[11px] tracking-wide" style={{ color: 'var(--ink-3)' }}>목표 편집</span>
        <span className="w-12" />
      </div>

      {/* 1. 목표 */}
      <section className="space-y-2.5">
        <div className="sec-label">목표</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full !rounded-2xl !px-4 !py-3" />
      </section>

      {/* 2. 영역 · 기한 */}
      <section className="space-y-2.5">
        <div className="sec-label">영역</div>
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaId(a.id)}
              className="chip pressable !text-[13px]"
              style={areaId === a.id
                ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)', fontWeight: 500 }
                : { color: 'var(--ink-2)' }}
            >
              {a.icon} {a.name}
            </button>
          ))}
        </div>
        <div className="sec-label pt-2">기한</div>
        <div className="flex items-center gap-2.5">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="!py-2" />
          <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
            {dueDate && dueDate > today ? `${weekCount}주 남음` : '오늘 이후로 골라주세요'}
          </span>
        </div>
      </section>

      {/* 3. 지표 */}
      <section className="space-y-2.5">
        <div className="sec-label">지표 — 이걸로 진행률을 재요</div>
        <div className="flex flex-col gap-2.5">
          {krs.map((k, i) => (
            <KrCard key={k.id ?? `new-${i}`} kr={k} removable onChange={(p) => updateKr(i, p)} onRemove={() => removeKr(i)} />
          ))}
          {krs.length < MAX_KRS && (
            <button
              onClick={() => setKrs((prev) => [...prev, { title: '', target: '', unit: '' }])}
              className="rounded-2xl border border-dashed py-3 text-[14px]"
              style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-3)' }}
            >
              + 지표 하나 더 (최대 {MAX_KRS}개)
            </button>
          )}
        </div>
        {removedKrs.length > 0 && (
          <p className="text-[12.5px]" style={{ color: 'var(--urgent)' }}>
            저장하면 {removedKrs.map((r) => `「${r.title}」`).join(' ')} 지표가 삭제됩니다.
          </p>
        )}
      </section>

      {/* 4. 주간 계획 — 기한을 바꾸면 주차 목표치가 자동으로 다시 나뉜다 */}
      <section className="space-y-2.5">
        <div className="sec-label">주간 계획 · {weekCount}주</div>
        {pastWeeks.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[13px]" style={{ color: 'var(--ink-3)' }}>지난 주 계획 {pastWeeks.length}개 ▾</summary>
            <ul className="mt-1.5 space-y-1 pl-1">
              {pastWeeks.map((p) => (
                <li key={p.id} className="text-[13px]" style={{ color: 'var(--ink-4)' }}>{fmtMD(p.week_of)} · {p.title}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex flex-col gap-2">
          {Array.from({ length: weekCount }, (_, i) => {
            const marks = krs
              .filter((k) => isKrFilled(k) && k.cadence !== 'weekly')
              .map((k) => `${k.title.trim()} ${weeklyTargets(k, weekCount)[i]}${parseAmount(k.target).unit}`)
              .slice(0, 3);
            return (
              <div key={i} className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="mono w-8 shrink-0 text-xs" style={{ color: 'var(--ink-3)' }}>{i + 1}주</span>
                  <input
                    value={weeks[i] ?? ''}
                    onChange={(e) => setWeeks((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="이 주에 할 일"
                    className="min-w-0 flex-1"
                  />
                </div>
                {marks.length > 0 && (
                  <p className="mono pl-[42px] text-[11px]" style={{ color: 'var(--ink-4)' }}>목표 {marks.join(' · ')}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 매듭짓기 */}
      <section className="space-y-2.5 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
        <div className="sec-label">이 목표 매듭짓기</div>
        <div className="flex gap-2">
          <button onClick={() => finish('done')} className="chip pressable !text-[13px]" style={{ color: 'var(--accent-deep)', borderColor: 'var(--accent)' }}>
            ✓ 완료
          </button>
          <button onClick={() => finish('dropped')} className="chip pressable !text-[13px]" style={{ color: 'var(--ink-3)' }}>
            그만두기
          </button>
        </div>
      </section>

      {error && <p className="text-sm" style={{ color: 'var(--urgent)' }}>{error}</p>}

      <div className="sticky bottom-[76px] pt-3 md:bottom-4" style={{ background: 'linear-gradient(rgba(250,249,245,0), var(--paper) 40%)' }}>
        <button
          onClick={save}
          disabled={pending || !title.trim()}
          className="w-full rounded-2xl py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          style={{ background: 'var(--ink)' }}
        >
          {pending ? '저장 중…' : '저장'}
        </button>
        {krs.some(isKrFilled) && (
          <p className="pt-2 text-center text-[12px]" style={{ color: 'var(--ink-4)' }}>
            {krs.filter(isKrFilled).map(krSentence).join(' · ')}
          </p>
        )}
      </div>
    </main>
  );
}
