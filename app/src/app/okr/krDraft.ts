// 지표(KR) 입력의 공용 규칙 — 새 목표 위저드와 목표 편집이 같은 것을 쓴다.
// 화면을 두 벌 만들지 않기 위한 단일 출처.

/**
 * target/start 는 사용자가 친 원문 그대로("30km", "89kg") — 숫자·단위 분리는 읽을 때 한다.
 * start 가 undefined면 "현재 상태"를 아예 안 쓰는 지표(주 3회, 총 100km 등).
 */
export type KRDraft = {
  id?: string; // 편집 시 기존 지표 식별용 (신규는 없음)
  title: string;
  target: string;
  unit: string;
  start?: string;
  cadence?: 'total' | 'weekly';
  /**
   * 체크할 때 무엇을 받을지. 이름으로 성격을 추측하던 하드코딩을 대신한다.
   *   check  — 톡 한 번에 step(보통 1)만큼 (강의 3회, 자소서 12곳)
   *   number — 숫자를 받는다 (오늘 몇 시간·몇 문제·몇 km)
   *   text   — 내용을 받는다 (지원한 회사명, 틀린 유형). 개수는 1씩 오르고 적은 건 기록에 남는다
   */
  mode?: KrMode;
  /**
   * 이번 주 몫 — 최종형에서만 쓴다(015). "코테 100문제"의 이번 주 20문제.
   * 최종 목표와 이번 주 할 일은 다른 질문이라 칸을 나눴다.
   * 비어 있으면 오늘 할일에 안 뜬다.
   */
  weekly?: string;
};

export type KrMode = 'check' | 'number' | 'text';

export const KR_MODES: { key: KrMode; label: string; hint: string }[] = [
  { key: 'check', label: '완료만', hint: '누르면 한 번으로 세요' },
  { key: 'number', label: '숫자', hint: '몇 시간·몇 개인지 적어요' },
  { key: 'text', label: '내용', hint: '회사명처럼 적어 남겨요' },
];

/** 단위만 보고 고르는 첫 제안 — 사용자가 바꾸면 그 선택이 이긴다. */
export function guessMode(k: Pick<KRDraft, 'target' | 'unit'>): KrMode {
  const u = (parseAmount(k.target).unit || k.unit || '').trim();
  return ['회', '번', '개', '권', '곳', '건'].includes(u) ? 'check' : 'number';
}

export function krMode(k: KRDraft): KrMode {
  return k.mode ?? guessMode(k);
}

/** "30km" → { num: 30, unit: 'km' }. 숫자가 없으면 num 0. */
export function parseAmount(raw: string | undefined): { num: number; unit: string } {
  const s = (raw ?? '').trim();
  const num = Number((s.match(/\d+(?:[.,]\d+)?/)?.[0] ?? '').replace(',', ''));
  const unit = s.replace(/[\d.,\s]/g, '').slice(0, 6);
  return { num: Number.isFinite(num) && num > 0 ? num : 0, unit };
}

export function krUnit(k: KRDraft): string {
  return parseAmount(k.target).unit || parseAmount(k.start).unit || k.unit || '';
}

/** 지표를 사람 문장으로 — 확인 문구가 전부 이걸 쓴다. */
export function krSentence(k: KRDraft): string {
  const t = parseAmount(k.target);
  const s = parseAmount(k.start);
  const unit = krUnit(k);
  if (k.cadence === 'weekly') return `매주 ${k.title.trim()} ${t.num}${unit}`;
  if (s.num > 0 && s.num !== t.num) return `${k.title.trim()} ${s.num}${unit} → ${t.num}${unit}`;
  return `${k.title.trim()} ${t.num}${unit}`;
}

/** 진행률을 어떻게 재는지 사람 말로 — "시작이 뭔데?" 를 없애는 확인 문장. */
export function krExplain(k: KRDraft): string {
  const t = parseAmount(k.target);
  const s = parseAmount(k.start);
  const unit = krUnit(k);
  const how =
    krMode(k) === 'text' ? ' 체크할 때 내용을 적어 남겨요.'
    : krMode(k) === 'number' ? ' 체크할 때 숫자를 적어요.'
    : '';
  if (krMode(k) === 'text' && t.num === 0) {
    return k.cadence === 'weekly'
      ? '적은 내용이 이번 주 기록으로 쌓여요. 월요일마다 새로 시작해요.'
      : '적은 내용이 목표 화면에 쌓여요.';
  }
  if (k.cadence === 'weekly') return `매주 ${t.num}${unit} 하면 100%. 월요일마다 0에서 다시 시작해요.${how}`;
  if (s.num > 0 && s.num !== t.num) return `${s.num}${unit}에서 ${t.num}${unit}이 되면 100%예요.${how}`;
  return `0에서 ${t.num}${unit}을 채우면 100%예요.${how}`;
}

export function isKrFilled(k: KRDraft): boolean {
  // 내용형은 목표 개수가 없어도 성립한다 ("틀린 유형 적어두기"처럼 세는 게 목적이 아닌 경우)
  if (!k.title.trim()) return false;
  return krMode(k) === 'text' || parseAmount(k.target).num > 0;
}

/** 서버로 보낼 형태 — 원문 문자열을 숫자·단위로 확정한다. */
export function toKrPayload(k: KRDraft) {
  return {
    id: k.id,
    title: k.title.trim(),
    target: parseAmount(k.target).num,
    unit: krUnit(k),
    start: parseAmount(k.start).num > 0 ? parseAmount(k.start).num : undefined,
    cadence: (k.cadence ?? 'total') as 'total' | 'weekly',
    mode: krMode(k),
    // 주간형은 target 이 곧 주간 몫이라 따로 보내지 않는다 (읽을 땐 krWeeklyTarget 이 합친다)
    weeklyTarget: k.cadence === 'weekly' ? undefined : (parseAmount(k.weekly).num || undefined),
  };
}

export const MAX_KRS = 5;

/**
 * 주차별 목표치 균등 분배 — 기한을 늘리면 주당 몫이 자동으로 줄어든다.
 * 매주 반복형(주 3회)은 기간과 무관하므로 매주 같은 값을 돌려준다.
 * 반환: weekIndex(0-based) → 그 주차 "누적 목표치"
 */
export function weeklyTargets(k: KRDraft, weekCount: number): number[] {
  const t = parseAmount(k.target).num;
  const s = parseAmount(k.start).num;
  const n = Math.max(1, weekCount);
  if (k.cadence === 'weekly') return Array.from({ length: n }, () => t);
  const from = s > 0 ? s : 0;
  const step = (t - from) / n;
  return Array.from({ length: n }, (_, i) => Math.round((from + step * (i + 1)) * 10) / 10);
}
