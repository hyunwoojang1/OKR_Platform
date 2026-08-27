'use server';

import { actionMessage, type ActionState } from '../form';
import { toggleEventDone } from './calendar';
import { createSeason, updateSeason } from './seasons';
import { logKrProgress, undoKrProgress } from './kr';
import { toggleHabitLog } from './habits';
import { toggleTask } from './tasks';

/**
 * 폼이 오류 메시지를 화면에 띄울 수 있게 감싼 판.
 * 
 * 원 액션은 그대로 두고 형제로 감싼다 — 시그니처를 바꾸면 <form action={fn}> 으로 그 액션을
 * 쓰는 컴포넌트가 전부 깨지고, 클라이언트에서 감싸면 JS 없이 폼이 제출되는 이점을 잃는다.
 */

async function asState(fn: (fd: FormData) => Promise<void>, fd: FormData): Promise<ActionState> {
  try { await fn(fd); return { ok: true }; } catch (e) { return { ok: false, message: actionMessage(e) }; }
}

export async function toggleEventDoneState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(toggleEventDone, fd);
}

export async function createSeasonState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(createSeason, fd);
}

export async function updateSeasonState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(updateSeason, fd);
}

export async function logKrProgressState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(logKrProgress, fd);
}

export async function undoKrProgressState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(undoKrProgress, fd);
}

export async function toggleHabitLogState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(toggleHabitLog, fd);
}

export async function toggleTaskState(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return asState(toggleTask, fd);
}
