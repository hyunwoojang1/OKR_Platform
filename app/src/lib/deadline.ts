import type { CalendarEvent } from './types';

/**
 * 달력 일정 중 "내가 뭔가 해야 하는 것"을 가려낸다.
 *
 * 왜 규칙이 필요한가: 구글에서 내려온 20건에는 성격이 섞여 있다.
 *   🔴 마감 — iM뱅크 신입행원 공채   → 내가 지원해야 함
 *   투운사 합격 발표일               → 확인만, 할 게 없음
 *   Stay at 12시리뷰이벤트#연세대…   → 광고
 * 전부에 체크박스를 달면 발표일에도 붙어 지저분하고, 안 달면 마감을 놓친다.
 *
 * 규칙은 짐작일 뿐이라 사용자가 덮어쓸 수 있다(is_deadline). 손으로 정한 게 항상 이긴다.
 */
const ACTION_WORDS = /🔴|마감|접수|제출|원서|지원|필기|시험|면접|코딩테스트|코테/i;
/** 내가 할 일이 없는 것 — 결과를 기다리는 날 */
const PASSIVE_WORDS = /발표|합격자|결과|당첨/;

export function isDeadlineEvent(e: Pick<CalendarEvent, 'title' | 'is_deadline'>): boolean {
  if (e.is_deadline !== null && e.is_deadline !== undefined) return e.is_deadline;
  const t = e.title ?? '';
  if (PASSIVE_WORDS.test(t)) return false;
  return ACTION_WORDS.test(t);
}

/**
 * 자격증 이름 사전.
 *
 * 왜 필요한가: '필기'라는 같은 단어가 양쪽에 쓰인다.
 *   "빅분기 필기 시험"        → 자격증
 *   "📝 A매치 필기시험일 — 금감원 2차" → 회사(공채)
 * 행위(마감·필기·접수·발표)로는 원리적으로 못 가른다. 갈리는 건 대상이 회사냐 자격증이냐다.
 *
 * 그리고 달력에 실제로 쓰이는 표기는 대부분 줄임말이라(투운사·빅분기),
 * 공식 명칭만 긁어와서는 정작 안 잡힌다. 줄임말을 같이 넣는 이유.
 */
export const CERT_NAMES: string[] = [
  // 금융 — 협회·민간
  '투운사', '투자자산운용사', '증권분석사', '재무위험관리사', 'FRM', 'CFA', 'AFPK', 'CFP',
  '신용분석사', '여신심사역', '자산관리사', 'FP', '은행텔러', '외환전문역', '펀드투자권유',
  '증권투자권유', '파생상품투자권유', '투자권유대행인', '보험심사역', '손해사정사',
  '금융투자분석사', '재경관리사', '회계관리', 'AT자격', '전산세무', '전산회계',
  // 공인 — 국가
  '공인회계사', 'CPA', '세무사', '감정평가사', '보험계리사', '공인노무사', '변리사',
  '주택관리사', '공인중개사', '물류관리사', '유통관리사', '무역영어', '국제무역사',
  // IT·데이터
  '빅분기', '빅데이터분석기사', 'ADsP', 'ADP', 'SQLD', 'SQLP', '정보처리기사', '정보처리산업기사',
  '정보보안기사', '리눅스마스터', '네트워크관리사', '컴활', '컴퓨터활용능력', '워드프로세서',
  'DAsP', 'DAP', 'CSTS', 'PMP',
  // 어학
  '토익', 'TOEIC', '토플', 'TOEFL', '오픽', 'OPIc', '텝스', 'TEPS', 'HSK', 'JLPT', 'DELE',
  '토익스피킹', 'TOEIC Speaking', 'IELTS', 'FLEX',
];

const CERT_RE = new RegExp(
  CERT_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

export function looksLikeCert(title: string): boolean {
  return CERT_RE.test(title ?? '');
}

export type SeasonLite = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  keywords: string[];
};

/**
 * 일정이 어느 시즌 폴더로 갈지.
 * 키워드 → 날짜 → 없으면 null(기타) 순. 여러 시즌에 걸리면 기간이 더 짧은 쪽을 고른다
 * (9월 자격증이 8~10월 공채보다 구체적이므로).
 * 사용자가 직접 지정한 season_id가 있으면 그게 항상 이긴다.
 */
export function pickSeason(
  e: Pick<CalendarEvent, 'title' | 'starts_at' | 'season_id'>,
  seasons: SeasonLite[],
): string | null {
  if (e.season_id) return e.season_id;
  const title = e.title ?? '';
  const day = new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);

  const span = (s: SeasonLite) =>
    s.starts_on && s.ends_on
      ? new Date(s.ends_on).getTime() - new Date(s.starts_on).getTime()
      : Number.MAX_SAFE_INTEGER;

  const byKeyword = seasons
    .filter((s) => s.keywords.some((k) => k.trim() && title.toLowerCase().includes(k.trim().toLowerCase())))
    .sort((a, b) => span(a) - span(b));
  if (byKeyword.length > 0) return byKeyword[0].id;

  const byDate = seasons
    .filter((s) => (!s.starts_on || day >= s.starts_on) && (!s.ends_on || day <= s.ends_on))
    .sort((a, b) => span(a) - span(b));
  return byDate[0]?.id ?? null;
}

/** 오늘 기준 D-day. 음수면 지난 것. */
export function ddayOf(startsAt: string, today: string): number {
  const day = new Date(new Date(startsAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  return Math.round(
    (new Date(`${day}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86400_000,
  );
}

/** 마감이 오늘 할일에 올라오기 시작하는 시점 — 미리 처리할 여유를 준다. */
export const DEADLINE_LEAD_DAYS = 3;
