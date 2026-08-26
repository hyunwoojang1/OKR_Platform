import {
  makeDeadline, makeGoal, makeTask, makeHabit, mk, kstToday,
} from './lib/fixtures.mjs';
import { TAG } from './lib/db.mjs';

/**
 * 연쇄 선언표 — 이 파일의 한 줄이 검사 하나다.
 *
 * 2026-08-26 감사에서 난 사고: 달력 마감 완료가 네 곳을 움직이는데(일정·할일·지표·기록)
 * 되돌리기는 두 곳만 되돌렸다. 완료↔해제를 세 번 반복하면 지표가 4까지 올라가고
 * 기록이 4건 쌓였다. 코드에서는 두 함수가 60줄 떨어져 있어 눈으로 안 잡혔다.
 *
 * 그래서 "무엇을 건드리는가"를 코드가 아니라 여기에 적게 했다.
 * 선언과 실제가 어긋나면 T1 이 잡는다.
 *
 * 한 줄의 뜻:
 *   key        서버 액션 이름 (T5 가 이 목록과 실제 export 를 대조한다)
 *   label      한국어 설명. docs/CHAIN_MAP.md 에 그대로 나간다
 *   setup      픽스처를 만들고 { page, doAnchor, undoAnchor, ... } 를 돌려준다
 *   touches    do 가 건드려도 되는 테이블. 여기 없는 걸 건드리면 T1 실패
 *   volatile   왕복에서 눈감아 줄 컬럼 (시각처럼 매번 달라지는 것)
 *   roundTrip  true | '되돌릴 수 없음 — 사유'
 *   idempotent true | '멱등이 아님 — 사유'
 */

export const CHAINS = [
  {
    key: 'togglePinEvent',
    label: '달력 일정을 홈 D-day 보드에 핀 / 핀 해제',
    touches: ['calendar_events'],
    volatile: [],
    roundTrip: true,
    idempotent: true,
    async setup(created) {
      const ev = await makeDeadline(created, { title: '핀 테스트' });
      const page = `/calendar?m=${kstToday().slice(0, 7)}&d=${kstToday()}`;
      return {
        page,
        do: { anchor: { id: ev.id, pinned: 'true' } },
        undo: { anchor: { id: ev.id, pinned: 'false' } },
      };
    },
  },

  {
    key: 'toggleEventDone',
    label: '달력 마감을 다 했다고 찍기 / 되돌리기 (지표 연결된 것)',
    // 완료 한 번이 네 곳을 움직인다. 되돌리기도 네 곳을 되돌려야 한다.
    touches: ['calendar_events', 'daily_tasks', 'key_results', 'session_logs'],
    volatile: [],
    roundTrip: true,
    idempotent: true,
    async setup(created) {
      const { kr } = await makeGoal(created, { krTitle: '자소서 제출', target: 12 });
      const ev = await makeDeadline(created, { krId: kr.id, title: '마감 — 가짜공채' });
      const day = kstToday();
      return {
        page: `/calendar?m=${day.slice(0, 7)}&d=${day}`,
        do: { anchor: { id: ev.id, done: 'true' } },
        undo: { anchor: { id: ev.id, done: 'false' } },
      };
    },
  },

  {
    key: 'toggleTask',
    label: '오늘 할일 체크 / 해제',
    touches: ['daily_tasks', 'session_logs'],
    volatile: [],
    roundTrip: true,
    idempotent: true,
    async setup(created) {
      const task = await makeTask(created);
      return {
        page: '/',
        do: { anchor: { id: task.id, done: 'true' } },
        undo: { anchor: { id: task.id, done: 'false' } },
      };
    },
  },

  {
    key: 'toggleHabitLog',
    label: '루틴 오늘 체크 / 해제',
    touches: ['habit_logs'],
    volatile: [],
    roundTrip: true,
    idempotent: true,
    async setup(created) {
      const habit = await makeHabit(created);
      return {
        page: '/',
        do: { anchor: { habit_id: habit.id, date: kstToday(), done: 'true' } },
        undo: { anchor: { habit_id: habit.id, date: kstToday(), done: 'false' } },
      };
    },
  },

  {
    key: 'toggleInitiativeDone',
    label: '주간 계획 한 줄 체크 / 해제',
    touches: ['initiatives', 'session_logs'],
    volatile: [],
    roundTrip: true,
    idempotent: true,
    async setup(created) {
      const { area, objective } = await makeGoal(created);
      const ini = await mk(created, 'initiatives', {
        objective_id: objective.id, area_id: area.id,
        title: `${TAG} 주간 한 줄`, week_of: kstMonday(), status: 'active',
      });
      return {
        page: `/okr/${objective.id}`,
        do: { anchor: { id: ini.id, done: 'true' } },
        undo: { anchor: { id: ini.id, done: 'false' } },
      };
    },
  },
];

/** 이번 주 월요일 — 앱의 kstMonday() 와 같은 계산. */
function kstMonday() {
  const d = new Date(Date.now() + 9 * 3600_000);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/**
 * 검사를 붙이지 않는 서버 액션과 그 사유.
 * T5 가 "표에도 없고 여기에도 없는 액션"을 잡는다 — 새 액션을 만들면 둘 중 하나에 적어야 한다.
 */
export const EXEMPT = {
  suggestGoalPlan: '읽기 전용 — AI 초안 제안. 저장은 createGoalPlan 이 한다',
  normalizeKrDrafts: '읽기 전용 — AI 표기 정리',
  suggestParentGoal: '읽기 전용 — 상위 목표 추천',
  syncKRsNow: '외부 집계 재계산 — 되돌린다는 개념이 없다',
  syncCalendarNow: '구글 동기화 — 외부가 정본이라 되돌릴 수 없다',
};
