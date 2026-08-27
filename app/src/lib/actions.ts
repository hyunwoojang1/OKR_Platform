/**
 * 서버 액션 모음의 입구.
 *
 * 여기서 함수를 '정의'하지 않는다 — 도메인별 파일이 정의하고 이 파일은 다시 내보내기만 한다.
 * 그래서 'use server' 가 없다. 서버 액션의 신원은 정의된 모듈 기준이라 재수출은 안전하다.
 *
 * 왜 쪼갰나: 한 파일에 1,179줄·액션 53개가 있었다. 프로젝트 자체 규칙이 800줄인데
 * 그걸 넘긴 지 오래였고, 실제로 완료 로직과 되돌리기 로직이 60줄 떨어져 있어서
 * 짝이 안 맞는 걸 눈으로 못 잡은 사고가 났다.
 *
 * 소비하는 쪽(17개 컴포넌트)의 import 경로는 그대로 둔다 — 이 커밋은 순수 이동이라
 * 동작이 한 줄도 바뀌면 안 된다.
 */

export {
  createArea,
  updateArea,
  archiveArea,
  createObjective,
  createMilestone,
  createInitiative,
  setStatus,
  toggleInitiativeDone,
  setGoalStatus,
} from './actions/okr';
export {
  createKeyResult,
  syncKRsNow,
  updateKRProgress,
  logKrProgress,
  undoKrProgress,
  recordWeeklyMetric,
  deleteLog,
  createLog,
  deleteKeyResult,
  pullCodingFromNotion,
} from './actions/kr';
export {
  createTask,
  toggleTask,
  updateTask,
  deleteTask,
  promoteTaskToRoutine,
} from './actions/tasks';
export {
  createHabit,
  updateHabit,
  deleteHabit,
  toggleHabitLog,
} from './actions/habits';
export {
  createEvent,
  deleteEvent,
  toggleEventDone,
  setEventDeadline,
  setEventKr,
  togglePinEvent,
  togglePinObjective,
  syncCalendarNow,
} from './actions/calendar';
export {
  createSeason,
  updateSeason,
  deleteSeason,
  setEventSeason,
  seedSeasons,
} from './actions/seasons';
export {
  suggestGoalPlan,
  normalizeKrDrafts,
  suggestParentGoal,
  createGoalPlan,
  updateGoalPlan,
} from './actions/goal-plan';
export type {
  GoalSuggestion,
  GoalSuggestionResult,
  NormalizedKr,
} from './actions/goal-plan';
export {
  sendJobCommand,
  saveReview,
} from './actions/misc';
export {
  toggleEventDoneState,
  createSeasonState,
  updateSeasonState,
  logKrProgressState,
  undoKrProgressState,
  toggleHabitLogState,
  toggleTaskState,
} from './actions/state';
