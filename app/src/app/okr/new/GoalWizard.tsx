'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGoalPlan, suggestGoalPlan } from '@/lib/actions';
import type { Area } from '@/lib/types';
import { kstToday } from '@/lib/types';

// start: 시작값(선택) — 목표보다 크면 줄이기형(체중 75→70). cadence: 매주 반복형 여부.
type KRDraft = { title: string; target: string; unit: string; start?: string; cadence?: 'total' | 'weekly' };

// 지표를 사람 문장으로 — 검토·확인 문구가 전부 이걸 쓴다.
function krSentence(k: KRDraft): string {
  const startNum = Number(k.start ?? '');
  const hasStart = !!k.start?.trim() && Number.isFinite(startNum) && startNum !== Number(k.target);
  if (k.cadence === 'weekly') return `매주 ${k.title.trim()} ${k.target}${k.unit}`;
  if (hasStart) return `${k.title.trim()} ${k.start}${k.unit} → ${k.target}${k.unit}`;
  return `${k.title.trim()} ${k.target}${k.unit}`;
}
type UpcomingEvent = { title: string; date: string };

const WEEK_OPTIONS = [4, 6, 8];
const MAX_WEEKS = 12;
const MAX_KRS = 5;
const UNIT_CHIPS = ['회', '개', 'km', '점', '곳', '시간', '권', '%'];

// 영역 이름 키워드 → 추천 지표. 탭 한 번으로 행이 완성된다.
const KR_SUGGESTIONS: { match: RegExp; items: KRDraft[] }[] = [
  {
    match: /운동|헬스|러닝|건강/,
    items: [
      { title: '러닝 거리', target: '30', unit: 'km' },
      { title: '운동 나간 날', target: '12', unit: '회' },
      { title: '체중 감량', target: '3', unit: 'kg' },
    ],
  },
  {
    match: /취업|공채|이직/,
    items: [
      { title: '자기소개서 제출', target: '12', unit: '곳' },
      { title: '모의고사 점수', target: '75', unit: '점' },
      { title: '면접 경험', target: '3', unit: '회' },
    ],
  },
  {
    match: /자격증|시험|공부/,
    items: [
      { title: '기출 회독', target: '10', unit: '회' },
      { title: '모의고사 점수', target: '80', unit: '점' },
      { title: '공부 시간', target: '60', unit: '시간' },
    ],
  },
  {
    match: /재테크|투자|저축|돈/,
    items: [
      { title: '저축액', target: '300', unit: '만원' },
      { title: '지출 기록한 날', target: '30', unit: '일' },
      { title: '경제 공부', target: '10', unit: '시간' },
    ],
  },
  {
    match: /자기계발|독서|배움/,
    items: [
      { title: '책 완독', target: '5', unit: '권' },
      { title: '강의 수강', target: '20', unit: '강' },
      { title: '글쓰기', target: '8', unit: '편' },
    ],
  },
  {
    match: /일|업무|회사/,
    items: [
      { title: '핵심 과제 완료', target: '3', unit: '건' },
      { title: '보고·공유', target: '4', unit: '건' },
    ],
  },
];

// 제목 키워드 → 그 활동의 여러 "측면"(거리·페이스·횟수…)을 즉시 제안. LLM 없이 0초.
const TITLE_KR_SUGGESTIONS: { match: RegExp; items: KRDraft[] }[] = [
  {
    match: /러닝|달리기|마라톤|조깅/,
    items: [
      { title: '주간 러닝 거리', target: '30', unit: 'km' },
      { title: '5km 페이스', target: '6', unit: '분', start: '7' },
      { title: '러닝', target: '3', unit: '회', cadence: 'weekly' },
      { title: '최장 거리', target: '10', unit: 'km' },
    ],
  },
  {
    match: /토익|토플|오픽|영어/,
    items: [
      { title: '목표 점수', target: '900', unit: '점' },
      { title: '단어 암기', target: '1000', unit: '개' },
      { title: '모의고사', target: '10', unit: '회' },
      { title: '학습 시간', target: '60', unit: '시간' },
    ],
  },
  {
    match: /다이어트|감량|체중|몸무게/,
    items: [
      { title: '체중', target: '70', unit: 'kg', start: '75' },
      { title: '운동', target: '4', unit: '회', cadence: 'weekly' },
      { title: '식단 기록', target: '30', unit: '일' },
    ],
  },
  {
    match: /독서|책/,
    items: [
      { title: '완독', target: '5', unit: '권' },
      { title: '독서 시간', target: '20', unit: '시간' },
      { title: '서평 쓰기', target: '3', unit: '편' },
    ],
  },
  {
    match: /저축|적금|투자|모으기/,
    items: [
      { title: '저축액', target: '300', unit: '만원' },
      { title: '무지출 날', target: '15', unit: '일' },
      { title: '투자 공부', target: '10', unit: '시간' },
    ],
  },
  {
    match: /코딩|개발|프로젝트|포트폴리오/,
    items: [
      { title: '커밋한 날', target: '30', unit: '일' },
      { title: '기능 완성', target: '5', unit: '개' },
      { title: '강의 수강', target: '20', unit: '강' },
    ],
  },
  {
    match: /자소서|자기소개서|지원|공채/,
    items: [
      { title: '자소서 제출', target: '12', unit: '곳' },
      { title: '기업 분석', target: '10', unit: '곳' },
      { title: '필기 모의고사', target: '75', unit: '점' },
    ],
  },
  {
    match: /면접/,
    items: [
      { title: '모의 면접', target: '5', unit: '회' },
      { title: '예상 질문 답변', target: '30', unit: '개' },
    ],
  },
  {
    match: /헬스|근력|웨이트|3대/,
    items: [
      { title: '운동 나간 날', target: '12', unit: '회' },
      { title: '3대 중량 증가', target: '10', unit: 'kg' },
      { title: '단백질 챙긴 날', target: '25', unit: '일' },
    ],
  },
];

const TITLE_EXAMPLES = ['하반기 금융권 공채 합격', '10월까지 러닝 100km', '자격증 필기 한 번에 합격'];

function kstMondayPlus(weeks: number): string {
  const now = new Date(Date.now() + 9 * 3600_000);
  const day = (now.getUTCDay() + 6) % 7;
  now.setUTCDate(now.getUTCDate() - day + weeks * 7);
  return now.toISOString().slice(0, 10);
}

function weeksUntil(date: string): number {
  const monday0 = new Date(`${kstMondayPlus(0)}T00:00:00+09:00`).getTime();
  const due = new Date(`${date}T00:00:00+09:00`).getTime();
  const w = Math.ceil((due - monday0) / (7 * 86400_000));
  return Math.min(MAX_WEEKS, Math.max(1, w));
}

function fmtMD(date: string): string {
  return date.slice(5).replace('-', '/');
}

// 캘린더 일정 제목의 노이즈 제거: "🔴 마감 15:00 — 현대차증권 3분기 신입(...)" → "현대차증권 3분기 신입"
function cleanEventTitle(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^마감\s*(\d{1,2}:\d{2})?\s*[—–-]?\s*/, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .trim()
    .slice(0, 30);
}

// "30km"처럼 섞어 쳐도 숫자만 목표로, 붙은 글자는 단위로 살린다.
function splitNumberAndUnit(raw: string): { num: string; unit: string } {
  const num = raw.match(/\d+(?:\.\d+)?/)?.[0] ?? '';
  const unit = raw.replace(/[\d.,\s]/g, '').slice(0, 6);
  return { num, unit };
}

// v4 새 목표 위저드: 질문 하나씩 → 마지막에 "이렇게 잡아봤어요" 검토 → 확정.
// AI는 제안, 확정은 사용자 — 확정 전엔 아무것도 저장되지 않는다.
export default function GoalWizard({ areas, upcoming }: { areas: Area[]; upcoming: UpcomingEvent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0); // 0제목 1영역·기한 2지표 3주별 → 4검토
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState<string>('');
  const [dueWeeks, setDueWeeks] = useState<number>(6);
  const [customDue, setCustomDue] = useState<string>(''); // 캘린더 마감·직접 선택 날짜 (선택 시 프리셋보다 우선)
  const [krs, setKrs] = useState<KRDraft[]>([{ title: '', target: '', unit: '' }]);
  const [weeks, setWeeks] = useState<string[]>(Array.from({ length: 6 }, () => ''));

  // AI 초안 (로컬 Ollama — 무료): 제안만 채워주고, 확정은 여전히 사용자.
  const [aiPending, startAiTransition] = useTransition();
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 주별 계획 유령 초안: 빈칸에 흐릿하게 깔리고, Tab(또는 ✨ 탭)으로 그대로 채운다.
  const [weekGhosts, setWeekGhosts] = useState<string[]>([]);
  const [ghostPending, startGhostTransition] = useTransition();
  const ghostRequested = useRef(false);

  const today = kstToday();
  const isCustomDueValid = !!customDue && customDue > today;
  const effWeeks = isCustomDueValid ? weeksUntil(customDue) : dueWeeks;
  const dueDate = isCustomDueValid ? customDue : kstMondayPlus(dueWeeks);

  const validKrCount = krs.filter((k) => k.title.trim() && Number(k.target) > 0).length;
  const hasTitleWithoutNumber = krs.some((k) => k.title.trim() && !(Number(k.target) > 0));

  const canNext =
    step === 0 ? title.trim().length > 0
    : step === 1 ? !!areaId && (isCustomDueValid || !customDue)
    : step === 2 ? validKrCount > 0
    : true;

  // 잠긴 이유를 버튼 위에서 바로 말해준다 — 조용히 죽어있는 버튼 금지.
  const lockHint =
    canNext ? null
    : step === 0 ? '한 줄만 쓰면 다음으로 갈 수 있어요. 아래 예시를 탭해도 돼요.'
    : step === 1 ? (!areaId ? '영역을 하나 골라주세요.' : '기한 날짜가 지났어요. 오늘 이후로 골라주세요.')
    : hasTitleWithoutNumber ? "'얼마나'에 숫자를 넣으면 다음이 열려요. (예: 30)"
    : '지표를 하나 채우거나, 추천을 탭해보세요. 어려우면 건너뛰어도 돼요.';

  const areaName = areas.find((a) => a.id === areaId)?.name ?? '';
  // 제목 키워드 우선(러닝→거리·페이스·횟수…), 그다음 영역 기본 — 중복 제거, 최대 6개.
  const krSuggestions = useMemo(() => {
    const byTitle = TITLE_KR_SUGGESTIONS.filter((s) => s.match.test(title)).flatMap((s) => s.items);
    const byArea = KR_SUGGESTIONS.find((s) => s.match.test(areaName))?.items ?? [];
    const fallback = [
      { title: '실행한 횟수', target: '10', unit: '회' },
      { title: '들인 시간', target: '20', unit: '시간' },
    ];
    // 제목 매치가 있으면 그것만(더 구체적) — 영역 기본과 섞으면 "주간 러닝 거리"/"러닝 거리" 같은 유사 중복이 생긴다
    const merged = byTitle.length > 0 ? byTitle : byArea.length > 0 ? byArea : fallback;
    const seen = new Set<string>();
    return merged.filter((s) => !seen.has(s.title) && seen.add(s.title)).slice(0, 6);
  }, [title, areaName]);

  // 캘린더에서 온 마감 후보 (기한 단계·제목 예시에 쓴다)
  // 일주일 이상 남은 것만 — 내일 마감은 목표 기한이 못 된다. 같은 날짜는 하나로.
  const weekLater = kstMondayPlus(1);
  const deadlineOptions = useMemo(() => {
    const seen = new Set<string>();
    return upcoming
      .filter((e) => e.date >= weekLater)
      .map((e) => ({ ...e, title: cleanEventTitle(e.title) }))
      .filter((e) => e.title && !seen.has(e.date) && seen.add(e.date))
      .slice(0, 2);
  }, [upcoming, weekLater]);
  const titleChips = [
    ...deadlineOptions.slice(0, 1).map((e) => ({ label: `📅 ${e.title}`, value: `${e.title} 준비 끝내기` })),
    ...TITLE_EXAMPLES.map((t) => ({ label: t, value: t })),
  ];

  function resizeWeeks(n: number) {
    setWeeks((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
  }

  function setWeekCount(n: number) {
    setDueWeeks(n);
    setCustomDue('');
    resizeWeeks(n);
  }

  function setCustomDueDate(date: string) {
    setCustomDue(date);
    if (date && date > today) resizeWeeks(weeksUntil(date));
  }

  function updateKr(i: number, patch: Partial<KRDraft>) {
    setKrs((prev) => prev.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  }

  // 확정된 지표를 AI에 먹일 형태로 — 주별 초안이 "러닝" 한 단어가 아니라 지표를 향해 쓰이게 한다.
  function chosenKrsPayload() {
    return krs
      .filter((k) => k.title.trim() && Number(k.target) > 0)
      .map((k) => ({
        title: k.title,
        target: Number(k.target),
        unit: k.unit,
        start: Number(k.start ?? '') > 0 ? Number(k.start) : undefined,
        cadence: k.cadence ?? 'total',
      }));
  }

  function requestAiDraft() {
    setAiError(null);
    startAiTransition(async () => {
      try {
        const plan = await suggestGoalPlan({ title, areaName, weekCount: effWeeks, krs: chosenKrsPayload() });
        if (!plan.ok) {
          setAiError(plan.message);
          return;
        }
        // 사용자가 이미 쓴 행은 지키고, 빈 자리만 AI 제안으로 채운다.
        setKrs((prev) => {
          const kept = prev.filter((k) => k.title.trim());
          const room = MAX_KRS - kept.length;
          const added = plan.krs
            .filter((s) => !kept.some((k) => k.title.trim() === s.title))
            .slice(0, Math.max(0, room))
            .map((s) => ({ title: s.title, target: String(s.target), unit: s.unit }));
          const next = [...kept, ...added];
          return next.length > 0 ? next : prev;
        });
        // 주별 계획은 값으로 박지 않고 유령 초안으로만 — 다음 단계에서 Tab으로 수락한다.
        setWeekGhosts(plan.weeks);
        ghostRequested.current = true;
        setAiNote(`${plan.engine}가 초안을 잡았어요 — 마음에 안 드는 건 고치거나 지우세요. 주별 계획 초안은 다음 단계에 흐릿하게 보여드려요.`);
      } catch {
        setAiError('지금은 AI 초안을 쓸 수 없어요. 직접 입력해도 충분해요.');
      }
    });
  }

  function requestWeekGhosts() {
    startGhostTransition(async () => {
      try {
        const plan = await suggestGoalPlan({ title, areaName, weekCount: effWeeks, krs: chosenKrsPayload() });
        if (plan.ok) setWeekGhosts(plan.weeks);
      } catch {
        // 초안 실패는 조용히 넘어간다 — 수동 입력은 그대로 가능.
      }
    });
  }

  // 주별 단계(4/4)에 들어오면 자동으로 AI 초안을 뒤에서 잡는다 — 버튼 없이, "소목표에서 턱 막히는" 지점 제거.
  useEffect(() => {
    if (step !== 3 || ghostRequested.current || !title.trim()) return;
    ghostRequested.current = true;
    requestWeekGhosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function acceptGhost(i: number) {
    const ghost = weekGhosts[i];
    if (!ghost) return;
    setWeeks((prev) => prev.map((w, j) => (j === i && !w.trim() ? ghost : w)));
  }

  function acceptAllGhosts() {
    setWeeks((prev) => prev.map((w, i) => (w.trim() ? w : weekGhosts[i] ?? '')));
  }

  // 추천 칩 다중 선택 토글: 탭 = 지표로 추가, 다시 탭 = 제거.
  function isSuggestionOn(s: KRDraft): boolean {
    return krs.some((k) => k.title.trim() === s.title);
  }

  function toggleKrSuggestion(s: KRDraft) {
    setKrs((prev) => {
      const idx = prev.findIndex((k) => k.title.trim() === s.title);
      if (idx >= 0) {
        const next = prev.filter((_, j) => j !== idx);
        return next.length > 0 ? next : [{ title: '', target: '', unit: '' }];
      }
      const emptyIdx = prev.findIndex((k) => !k.title.trim());
      if (emptyIdx >= 0) return prev.map((k, j) => (j === emptyIdx ? { ...s } : k));
      if (prev.length < MAX_KRS) return [...prev, { ...s }];
      return prev;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const id = await createGoalPlan({
          areaId,
          title,
          dueDate,
          krs: krs.map((k) => ({
            title: k.title,
            target: Number(k.target),
            unit: k.unit,
            start: Number(k.start ?? '') > 0 ? Number(k.start) : undefined,
            cadence: k.cadence ?? 'total',
          })),
          weeks: weeks.map((w, i) => ({ weekOf: kstMondayPlus(i), title: w })),
        });
        router.push(`/okr/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했어요');
      }
    });
  }

  const stepLabel = step < 4 ? `새 목표 · ${step + 1}/4` : '확정 전 검토';

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-140px)] max-w-2xl flex-col">
      <div className="flex items-center justify-between pb-6">
        <button onClick={() => (step === 0 ? router.push('/okr') : setStep(step - 1))} className="text-sm" style={{ color: 'var(--ink-2)' }}>
          {step === 0 ? '✕' : '←'}
        </button>
        <span className="mono text-[11px] tracking-wide" style={{ color: 'var(--ink-3)' }}>{stepLabel}</span>
        {step === 2 || step === 3 ? (
          <button onClick={() => setStep(step + 1)} className="text-sm" style={{ color: 'var(--ink-4)' }}>건너뛰기</button>
        ) : (
          <span className="w-8" />
        )}
      </div>

      <div className="flex-1 space-y-7">
        {step === 0 && (
          <div className="space-y-5">
            <div className="text-xl font-medium leading-relaxed tracking-tight" style={{ textWrap: 'pretty' }}>
              무엇을 이루고 싶은지<br />한 줄로 알려주세요.
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 하반기 금융권 공채 합격"
              autoFocus
              className="w-full !rounded-3xl !px-5 !py-3.5"
            />
            <div className="space-y-2.5">
              <div className="sec-label">이런 목표는 어때요</div>
              <div className="flex flex-wrap gap-2">
                {titleChips.map((c) => (
                  <button key={c.label} onClick={() => setTitle(c.value)} className="chip pressable !text-[13px]" style={{ color: 'var(--ink-2)' }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {upcoming.length > 0 && (
                <div className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
                  캘린더에 다가오는 일정 {upcoming.length}건이 있어요. 그걸 향한 목표여도 좋아요.
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-7">
            <div className="space-y-4">
              <div className="text-xl font-medium leading-relaxed tracking-tight">어느 영역의 목표인가요?</div>
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => {
                  const on = areaId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAreaId(a.id)}
                      className="rounded-xl px-4 py-3 text-[15px]"
                      style={
                        on
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', fontWeight: 500 }
                          : { border: '1px solid var(--line-strong)' }
                      }
                    >
                      {a.icon} {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-xl font-medium leading-relaxed tracking-tight">언제까지 해볼까요?</div>
              <div className="flex flex-col gap-2">
                {WEEK_OPTIONS.map((n) => {
                  const on = !customDue && dueWeeks === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setWeekCount(n)}
                      className="flex items-center justify-between rounded-xl px-4 py-3.5"
                      style={
                        on
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)' }
                          : { border: '1px solid var(--line-strong)' }
                      }
                    >
                      <span className="text-[15px]" style={on ? { fontWeight: 500 } : undefined}>{n}주 동안</span>
                      <span className="mono text-xs" style={{ color: on ? 'var(--accent-deep)' : 'var(--ink-3)' }}>~{fmtMD(kstMondayPlus(n))}</span>
                    </button>
                  );
                })}
                {deadlineOptions.map((e) => {
                  const on = customDue === e.date;
                  return (
                    <button
                      key={`${e.title}-${e.date}`}
                      onClick={() => setCustomDueDate(e.date)}
                      className="flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left"
                      style={
                        on
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)' }
                          : { border: '1px dashed var(--line-strong)' }
                      }
                    >
                      <span className="min-w-0 truncate text-[15px]" style={on ? { fontWeight: 500 } : undefined}>📅 {e.title}까지</span>
                      <span className="mono shrink-0 text-xs" style={{ color: on ? 'var(--accent-deep)' : 'var(--ink-3)' }}>~{fmtMD(e.date)}</span>
                    </button>
                  );
                })}
                <label
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-[15px]"
                  style={
                    customDue && !deadlineOptions.some((e) => e.date === customDue)
                      ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)' }
                      : { border: '1px dashed var(--line-strong)' }
                  }
                >
                  <span style={{ color: 'var(--ink-2)' }}>직접 고르기</span>
                  <input
                    type="date"
                    value={customDue}
                    min={today}
                    onChange={(e) => setCustomDueDate(e.target.value)}
                    className="mono !w-auto !border-0 !bg-transparent !p-0 text-right !text-[13px]"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="text-xl font-medium leading-relaxed tracking-tight" style={{ textWrap: 'pretty' }}>
              다 됐는지 아닌지,<br />무엇으로 판단할까요?
            </div>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              숫자로 셀 수 있는 걸로요. <span style={{ color: 'var(--ink-2)' }}>예: 러닝이라면 “러닝 거리 30km”.</span> 1개면 충분해요.
            </div>
            <button
              onClick={requestAiDraft}
              disabled={aiPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-[15px] font-medium disabled:opacity-60"
              style={{ border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)' }}
            >
              {aiPending ? '✨ AI가 생각 중… (10~30초)' : '✨ AI에게 지표·주별 계획 초안 받기'}
            </button>
            {aiNote && <p className="text-[13px] leading-relaxed" style={{ color: 'var(--accent-deep)' }}>{aiNote}</p>}
            {aiError && <p className="text-[13px] leading-relaxed" style={{ color: 'var(--urgent)' }}>{aiError}</p>}
            <div className="space-y-2.5">
              <div className="sec-label">뭘 재고 싶어요? — 여러 개 골라도 돼요 (다시 탭하면 빠져요)</div>
              <div className="flex flex-wrap gap-2">
                {krSuggestions.map((s) => {
                  const on = isSuggestionOn(s);
                  return (
                    <button
                      key={s.title}
                      onClick={() => toggleKrSuggestion(s)}
                      className="chip pressable !text-[13px]"
                      style={
                        on
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)', fontWeight: 500 }
                          : { color: 'var(--ink-2)' }
                      }
                    >
                      {on ? '✓ ' : ''}{krSentence(s)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              {krs.map((k, i) => (
                <div key={i} className="space-y-2.5 rounded-2xl border p-3.5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                  <div className="flex items-center gap-2">
                    <input
                      value={k.title}
                      onChange={(e) => updateKr(i, { title: e.target.value })}
                      placeholder="무엇을 세나요? (예: 러닝 거리)"
                      className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 !text-[15px]"
                    />
                    {krs.length > 1 && (
                      <button
                        onClick={() => setKrs((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="지표 삭제"
                        className="shrink-0 text-sm"
                        style={{ color: 'var(--ink-4)' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="divider" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>{k.cadence === 'weekly' ? '매주 몇 번?' : '얼마나?'}</span>
                    <input
                      value={k.target}
                      onChange={(e) => {
                        const { num, unit } = splitNumberAndUnit(e.target.value);
                        updateKr(i, { target: num, ...(unit && !k.unit ? { unit } : {}) });
                      }}
                      placeholder="30"
                      inputMode="decimal"
                      className="mono w-[72px] text-center !py-1.5"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {UNIT_CHIPS.map((u) => {
                        const on = k.unit === u;
                        return (
                          <button
                            key={u}
                            onClick={() => updateKr(i, { unit: on ? '' : u })}
                            className="chip pressable !px-2.5 !py-1 !text-[12px]"
                            style={
                              on
                                ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)', fontWeight: 500 }
                                : { color: 'var(--ink-3)' }
                            }
                          >
                            {u}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {k.cadence !== 'weekly' && (
                      <>
                        <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>지금은?</span>
                        <input
                          value={k.start ?? ''}
                          onChange={(e) => {
                            const { num, unit } = splitNumberAndUnit(e.target.value);
                            updateKr(i, { start: num, ...(unit && !k.unit ? { unit } : {}) });
                          }}
                          placeholder="0"
                          inputMode="decimal"
                          className="mono w-[72px] text-center !py-1.5"
                        />
                      </>
                    )}
                    <button
                      onClick={() => updateKr(i, { cadence: k.cadence === 'weekly' ? 'total' : 'weekly', ...(k.cadence !== 'weekly' ? { start: '' } : {}) })}
                      className="chip pressable !px-2.5 !py-1 !text-[12px]"
                      style={
                        k.cadence === 'weekly'
                          ? { border: '1.5px solid var(--accent)', background: 'var(--accent-bg-soft)', color: 'var(--accent-deep)', fontWeight: 500 }
                          : { color: 'var(--ink-3)' }
                      }
                    >
                      {k.cadence === 'weekly' ? '✓ 매주 반복' : '매주 반복'}
                    </button>
                    {k.cadence !== 'weekly' && Number(k.start ?? '') > Number(k.target) && Number(k.target) > 0 && (
                      <span className="text-[12px]" style={{ color: 'var(--ink-3)' }}>줄이는 목표네요</span>
                    )}
                  </div>
                  {k.title.trim() && Number(k.target) > 0 && (
                    <div className="text-[13px]" style={{ color: 'var(--accent-deep)' }}>
                      ✓ “{krSentence(k)}” — 이걸로 진행률을 재요.
                    </div>
                  )}
                </div>
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="text-xl font-medium leading-relaxed tracking-tight" style={{ textWrap: 'pretty' }}>
              {effWeeks}주를 어떻게 쓸지<br />주마다 한 줄씩 잡아볼까요?
            </div>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              {ghostPending ? (
                <span style={{ color: 'var(--accent-deep)' }}>✨ AI가 초안을 잡는 중… 그동안 직접 써도 돼요.</span>
              ) : weekGhosts.length > 0 ? (
                <>
                  흐릿한 초안이 괜찮으면 <span style={{ color: 'var(--accent-deep)' }}>Tab 키(또는 ✨)</span>로 그대로 넣으세요. 비워둔 주는 건너뜁니다.
                </>
              ) : (
                '비워둔 주는 건너뜁니다. 나중에 채워도 돼요.'
              )}
            </div>
            {weekGhosts.length > 0 && !ghostPending && (
              <div className="flex flex-wrap gap-2">
                {weeks.some((w, i) => !w.trim() && weekGhosts[i]) && (
                  <button onClick={acceptAllGhosts} className="chip pressable !text-[13px]" style={{ color: 'var(--accent-deep)', borderColor: 'var(--accent)' }}>
                    ✨ 초안 모두 채우기
                  </button>
                )}
                <button
                  onClick={() => { setWeekGhosts([]); requestWeekGhosts(); }}
                  className="chip pressable !text-[13px]"
                  style={{ color: 'var(--ink-3)' }}
                >
                  ↻ 초안 다시 받기
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {weeks.map((w, i) => {
                const ghost = weekGhosts[i] ?? '';
                const showGhost = !w.trim() && !!ghost;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className="mono w-8 text-xs" style={{ color: 'var(--ink-3)' }}>{i + 1}주</span>
                    <input
                      value={w}
                      onChange={(e) => setWeeks(weeks.map((x, j) => (j === i ? e.target.value : x)))}
                      onKeyDown={(e) => {
                        // 빈칸에서 Tab = 유령 초안 수락 후 다음 주로 (기본 포커스 이동은 그대로 둔다)
                        if (e.key === 'Tab' && showGhost) acceptGhost(i);
                      }}
                      placeholder={showGhost ? ghost : i === 0 ? '예: 지원할 곳 확정, 마감 캘린더 정리' : ''}
                      className="min-w-0 flex-1"
                    />
                    {showGhost && (
                      <button
                        onClick={() => acceptGhost(i)}
                        aria-label={`${i + 1}주 초안 채우기`}
                        className="shrink-0 text-[15px]"
                        title="초안 그대로 넣기"
                      >
                        ✨
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-[22px] font-medium tracking-tight">이렇게 잡아봤어요</div>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                이전 단계로 돌아가 고칠 수 있어요. 확정하면 오늘부터 목표에 올라옵니다.
              </div>
            </div>
            <div className="tile space-y-2">
              <div className="mono text-[11px] tracking-wide" style={{ color: 'var(--ink-3)' }}>
                {areaName} · {fmtMD(dueDate)}까지
              </div>
              <div className="text-[19px] font-medium leading-snug tracking-tight">{title}</div>
            </div>
            {krs.some((k) => k.title.trim()) && (
              <div className="space-y-2.5">
                <div className="sec-label">이걸로 판단해요 · {krs.filter((k) => k.title.trim()).length}개</div>
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                  {krs.filter((k) => k.title.trim()).map((k, i) => (
                    <div key={i}>
                      {i > 0 && <div className="divider mx-4" />}
                      <div className="flex items-center justify-between px-4 py-[15px]">
                        <span className="text-[15px]">{k.title}</span>
                        <span className="mono text-[13px]" style={{ color: 'var(--ink-2)' }}>
                          {k.cadence === 'weekly'
                            ? `매주 ${k.target}${k.unit}`
                            : Number(k.start ?? '') > 0 && Number(k.start) !== Number(k.target)
                              ? `${k.start} → ${k.target}${k.unit}`
                              : `${k.target}${k.unit}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {weeks.some((w) => w.trim()) && (
              <div className="space-y-2.5">
                <div className="sec-label">주별 계획 · {effWeeks}주</div>
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                  {weeks.map((w, i) => w.trim() && (
                    <div key={i}>
                      <div className="flex gap-3 px-4 py-[14px]">
                        <span className="mono w-7 pt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>{i + 1}주</span>
                        <span className="flex-1 text-[15px] leading-normal">{w}</span>
                      </div>
                      <div className="divider mx-4 last:hidden" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm" style={{ color: 'var(--urgent)' }}>{error}</p>}
          </div>
        )}
      </div>

      <div className="sticky bottom-[76px] flex flex-col gap-2 pb-2 pt-4 md:bottom-4" style={{ background: 'linear-gradient(rgba(250,249,245,0), var(--paper) 40%)' }}>
        {lockHint && (
          <p className="px-1 text-center text-[13px]" style={{ color: 'var(--ink-3)' }}>{lockHint}</p>
        )}
        {step < 4 ? (
          <button
            onClick={() => canNext && setStep(step + 1)}
            disabled={!canNext}
            className="btn-dark w-full rounded-[14px] py-3.5 text-center text-[16px] font-medium text-white disabled:opacity-30"
            style={{ background: 'var(--ink)' }}
          >
            다음
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button onClick={() => setStep(0)} className="btn rounded-[14px] px-5 py-3.5 text-[16px]">다시</button>
            <button
              onClick={submit}
              disabled={pending}
              className="flex-1 rounded-[14px] py-3.5 text-center text-[16px] font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {pending ? '만드는 중…' : '이걸로 시작'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
