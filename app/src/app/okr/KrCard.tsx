'use client';

import { type KRDraft, krExplain, isKrFilled, parseAmount, krMode, KR_MODES } from './krDraft';

// 지표 한 장 — 새 목표 위저드와 목표 편집이 이 부품 하나를 공유한다.
// 규칙: 기본은 「목표」 한 칸. 「현재 상태 입력」을 눌러야 현재 칸이 생긴다.
// (예전 "시작(선택)" 칸이 항상 떠 있어서 "작은 목표"로 오해받고 진행률이 망가졌다)
/** 두 갈래·세 갈래 중 하나를 고르는 작은 버튼. 칩 하나를 켜고 끄는 방식은
    "안 누르면 무엇이 되는지"가 안 보여서, 항상 전부 늘어놓고 하나를 고르게 한다. */
function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="chip pressable !px-2.5 !py-1 !text-[12px]"
      style={on
        ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)', fontWeight: 500 }
        : { color: 'var(--ink-3)' }}
    >
      {children}
    </button>
  );
}

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
  const mode = krMode(kr);
  const hasStart = kr.start !== undefined;
  const decreasing = !weekly && parseAmount(kr.start).num > parseAmount(kr.target).num && parseAmount(kr.target).num > 0;

  return (
    <div className="space-y-2.5 rounded-2xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-2">
        <input
          value={kr.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="무엇을 할 건가요? (예: 문제 풀기)"
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

      {/* 기간 — 예전엔 '매주 반복' 칩 하나뿐이라 안 누르면 조용히 최종이 됐고,
          그래서 "주간 러닝 거리"가 이름만 주간이고 리셋이 안 되는 사고가 났다. 이제 대놓고 고른다. */}
      <div className="flex items-center gap-2.5">
        <span className="w-12 shrink-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>기간</span>
        <div className="flex gap-1.5">
          <Seg on={weekly} onClick={() => onChange({ cadence: 'weekly', start: undefined })}>주간</Seg>
          <Seg on={!weekly} onClick={() => onChange({ cadence: 'total' })}>최종</Seg>
        </div>
        <span className="text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
          {weekly ? '월요일마다 0으로' : '기한까지 쌓임'}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="w-12 shrink-0 text-[13px]" style={{ color: 'var(--ink-3)' }}>목표</span>
        <input
          value={kr.target}
          onChange={(e) => onChange({ target: e.target.value })}
          placeholder={mode === 'text' ? '비워도 돼요' : weekly ? '예: 3회' : '예: 100km · 85kg · 75점'}
          className="min-w-0 flex-1 !py-1.5"
        />
      </div>

      {/* 기록 방식 — 체크할 때 무엇을 받을지. 이름으로 성격을 추측하던 걸 대신한다. */}
      <div className="flex items-start gap-2.5">
        <span className="w-12 shrink-0 pt-1 text-[13px]" style={{ color: 'var(--ink-3)' }}>기록</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {KR_MODES.map((m) => (
              <Seg key={m.key} on={mode === m.key} onClick={() => onChange({ mode: m.key })}>{m.label}</Seg>
            ))}
          </div>
          <p className="mt-1 text-[11.5px]" style={{ color: 'var(--ink-4)' }}>
            {KR_MODES.find((m) => m.key === mode)?.hint}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!weekly && !hasStart && (
          <button onClick={() => onChange({ start: '' })} className="chip pressable !px-2.5 !py-1 !text-[12px]" style={{ color: 'var(--ink-3)' }}>
            ＋ 현재 상태 입력
          </button>
        )}
        {decreasing && <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>줄이는 목표네요</span>}
      </div>

      {isKrFilled(kr) && (
        <div className="text-[13px]" style={{ color: 'var(--accent-deep)' }}>✓ {krExplain(kr)}</div>
      )}
    </div>
  );
}
