'use client';

import { type KRDraft, krExplain, isKrFilled, parseAmount } from './krDraft';

// 지표 한 장 — 새 목표 위저드와 목표 편집이 이 부품 하나를 공유한다.
// 규칙: 기본은 「목표」 한 칸. 「현재 상태 입력」을 눌러야 현재 칸이 생긴다.
// (예전 "시작(선택)" 칸이 항상 떠 있어서 "작은 목표"로 오해받고 진행률이 망가졌다)
export default function KrCard({
  kr,
  onChange,
  onRemove,
  removable,
}: {
  kr: KRDraft;
  onChange: (patch: Partial<KRDraft>) => void;
  onRemove?: () => void;
  removable: boolean;
}) {
  const weekly = kr.cadence === 'weekly';
  const hasStart = kr.start !== undefined;
  const decreasing = !weekly && parseAmount(kr.start).num > parseAmount(kr.target).num && parseAmount(kr.target).num > 0;

  return (
    <div className="space-y-2.5 rounded-2xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-2">
        <input
          value={kr.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="무엇을 세나요? (예: 몸무게)"
          className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 !text-[15px]"
        />
        {removable && onRemove && (
          <button onClick={onRemove} aria-label="지표 삭제" className="shrink-0 text-sm" style={{ color: 'var(--ink-4)' }}>
            ✕
          </button>
        )}
      </div>

      <div className="divider" />

      {hasStart && !weekly && (
        <div className="flex items-center gap-2.5">
          <span className="w-12 shrink-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>현재</span>
          <input
            value={kr.start ?? ''}
            onChange={(e) => onChange({ start: e.target.value })}
            placeholder="예: 89kg"
            className="min-w-0 flex-1 !py-1.5"
          />
          <button
            onClick={() => onChange({ start: undefined })}
            aria-label="현재 상태 빼기"
            className="shrink-0 text-[12px]"
            style={{ color: 'var(--ink-4)' }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <span className="w-12 shrink-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>{weekly ? '매주' : '목표'}</span>
        <input
          value={kr.target}
          onChange={(e) => onChange({ target: e.target.value })}
          placeholder={weekly ? '예: 3회' : '예: 100km · 85kg · 75점'}
          className="min-w-0 flex-1 !py-1.5"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!weekly && !hasStart && (
          <button onClick={() => onChange({ start: '' })} className="chip pressable !px-2.5 !py-1 !text-[12px]" style={{ color: 'var(--ink-3)' }}>
            ＋ 현재 상태 입력
          </button>
        )}
        <button
          onClick={() => onChange({ cadence: weekly ? 'total' : 'weekly', ...(weekly ? {} : { start: undefined }) })}
          className="chip pressable !px-2.5 !py-1 !text-[12px]"
          style={
            weekly
              ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)', fontWeight: 500 }
              : { color: 'var(--ink-3)' }
          }
        >
          {weekly ? '✓ 매주 반복' : '매주 반복'}
        </button>
        {decreasing && <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>줄이는 목표네요</span>}
      </div>

      {isKrFilled(kr) && (
        <div className="text-[13px]" style={{ color: 'var(--accent-deep)' }}>✓ {krExplain(kr)}</div>
      )}
    </div>
  );
}
