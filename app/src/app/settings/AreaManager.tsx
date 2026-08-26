'use client';

import { useState } from 'react';
import { createArea, updateArea, archiveArea } from '@/lib/actions';
import type { Area } from '@/lib/types';

const SWATCHES = ['#3B7DD8', '#22A06B', '#E8833A', '#C0483C', '#7B5CD6', '#0F9BAF', '#B5852A', '#6B7280'];

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={`색 ${c}`}
          className="pressable h-6 w-6 rounded-full"
          style={{ background: c, outline: value.toLowerCase() === c.toLowerCase() ? '2px solid var(--ink)' : 'none', outlineOffset: '2px' }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="직접 고르기"
        className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
    </div>
  );
}

function AreaRow({ area }: { area: Area }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(area.color);

  return (
    <li className="py-2">
      <div className="flex items-center gap-2.5">
        <span className="area-dot" style={{ background: area.color }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium" style={area.archived ? { opacity: 0.45 } : undefined}>
          {area.name}{area.archived && <span className="t-cap"> · 보관됨</span>}
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="t-cap underline">{open ? '닫기' : '고치기'}</button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--line-strong)' }}>
          <form action={async (fd) => { await updateArea(fd); setOpen(false); }} className="space-y-2">
            <input type="hidden" name="id" value={area.id} />
            <input type="hidden" name="color" value={color} />
            <input name="name" defaultValue={area.name} required autoComplete="off"
              className="w-full rounded-lg border px-2 py-1.5 text-[14px]" style={{ borderColor: 'var(--line-strong)' }} />
            <ColorPicker value={color} onChange={setColor} />
            <button type="submit" className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>저장</button>
          </form>

          {/* 지우지 않고 내리는 이유: 딸린 할일·목표의 색과 분류가 통째로 날아간다 */}
          <form action={archiveArea} className="flex items-center gap-2 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
            <input type="hidden" name="id" value={area.id} />
            <input type="hidden" name="archived" value={area.archived ? 'false' : 'true'} />
            <span className="t-cap flex-1">
              {area.archived ? '다시 쓰면 목록에 나타납니다' : '보관하면 새로 고를 때 안 보입니다 (기존 기록은 그대로)'}
            </span>
            <button type="submit" className="t-cap underline" style={{ color: area.archived ? 'var(--accent-deep)' : 'var(--ink-3)' }}>
              {area.archived ? '되살리기' : '보관'}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

export default function AreaManager({ areas }: { areas: Area[] }) {
  const [adding, setAdding] = useState(false);
  const [color, setColor] = useState(SWATCHES[0]);

  return (
    <section className="tile">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="tile-title mb-0">영역</h2>
        <button type="button" onClick={() => setAdding(!adding)} className="t-cap underline">
          {adding ? '닫기' : '＋ 새 영역'}
        </button>
      </div>
      <p className="mb-2 text-xs opacity-60">할일·목표를 묶는 분류예요. 색이 화면 곳곳의 띠와 점으로 쓰입니다.</p>

      {adding && (
        <form action={async (fd) => { await createArea(fd); setAdding(false); }}
          className="mb-3 space-y-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--line-strong)' }}>
          <input type="hidden" name="color" value={color} />
          <input name="name" placeholder="예: 운동, 취업, 공부" required autoComplete="off"
            className="w-full rounded-lg border px-2 py-1.5 text-[14px]" style={{ borderColor: 'var(--line-strong)' }} />
          <ColorPicker value={color} onChange={setColor} />
          <button type="submit" className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent-deep)' }}>만들기</button>
        </form>
      )}

      {areas.length === 0 ? (
        <p className="t-sub py-3 text-center">아직 영역이 없어요.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {areas.map((a) => <AreaRow key={a.id} area={a} />)}
        </ul>
      )}
    </section>
  );
}
