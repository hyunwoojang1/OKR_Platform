'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { must, run } from '../form';

/**
 * 영역·목표·마일스톤·주간 계획 — 뼈대를 만들고 상태를 옮기는 것들.
 */

// ── 영역 ──
export async function createArea(form: FormData) {
  await run('영역 생성', () =>
    db().from('areas').insert({
      name: must(form.get('name'), '영역명'),
      color: must(form.get('color'), '컬러'),
      icon: (form.get('icon') as string)?.trim() || null,
    }),
  );
  revalidatePath('/okr');
}

/** 영역 이름·색 고치기. */
export async function updateArea(form: FormData) {
  const id = must(form.get('id'), '영역');
  await run('영역 수정', () =>
    db().from('areas').update({
      name: must(form.get('name'), '영역명'),
      color: must(form.get('color'), '컬러'),
    }).eq('id', id),
  );
  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/okr');
}

/** 영역 보관(archive). 실제로 지우면 딸린 할일·목표의 색이 통째로 날아가서, 목록에서만 내린다. */
export async function archiveArea(form: FormData) {
  const id = must(form.get('id'), '영역');
  const archived = form.get('archived') === 'true';
  await run('영역 보관', () => db().from('areas').update({ archived }).eq('id', id));
  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/okr');
}

// ── OKR 트리 ──
export async function createObjective(form: FormData) {
  await run('Objective 생성', () =>
    db().from('objectives').insert({
      area_id: must(form.get('area_id'), '영역'),
      title: must(form.get('title'), '제목'),
      period: must(form.get('period'), '분기'),
    }),
  );
  revalidatePath('/okr');
}

export async function createMilestone(form: FormData) {
  await run('마일스톤 생성', () =>
    db().from('milestones').insert({
      objective_id: must(form.get('objective_id'), 'Objective'),
      month: must(form.get('month'), '월'),
      title: must(form.get('title'), '제목'),
    }),
  );
  revalidatePath('/okr');
}

export async function createInitiative(form: FormData) {
  await run('이니셔티브 생성', () =>
    db().from('initiatives').insert({
      milestone_id: (form.get('milestone_id') as string)?.trim() || null,
      area_id: (form.get('area_id') as string)?.trim() || null,
      title: must(form.get('title'), '제목'),
      week_of: must(form.get('week_of'), '주'),
      priority: Math.min(3, Math.max(1, Number(form.get('priority') ?? 2) || 2)),
    }),
  );
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function setStatus(form: FormData) {
  const table = must(form.get('table'), '대상');
  const status = must(form.get('status'), '상태');
  if (!['objectives', 'milestones', 'initiatives'].includes(table)) throw new Error('허용되지 않은 대상');
  if (!['active', 'done', 'dropped'].includes(status)) throw new Error('허용되지 않은 상태');
  const id = must(form.get('id'), 'id');
  await run('상태 변경', () => db().from(table).update({ status }).eq('id', id));
  // 소목표 완료/취소 → 대목표의 "소목표 달성" 지표 롤업 + 물결 로그 (실패해도 상태 변경은 유지)
  if (table === 'objectives') {
    const { completeChildRollup, ensureGoalAggKR } = await import('../goal-link');
    if (status === 'done') await completeChildRollup(id);
    else {
      const { data } = await db().from('objectives').select('parent_id').eq('id', id).maybeSingle();
      if (data?.parent_id) await ensureGoalAggKR(data.parent_id).catch((e) => console.error('[goal-rollup]', e));
    }
  }
  revalidatePath('/okr');
  revalidatePath('/');
}

export async function toggleInitiativeDone(form: FormData) {
  const id = must(form.get('id'), '할 일');
  const done = form.get('done') === 'true';

  // toggleTask 와 같은 잠금 — 이미 그 상태면 0행이라 두 번째 요청은 여기서 끝난다.
  const { data, error: lockErr } = await db()
    .from('initiatives')
    .update({ status: done ? 'done' : 'active' })
    .eq('id', id)
    .eq('status', done ? 'active' : 'done')
    .select('title,area_id')
    .maybeSingle();
  if (lockErr) throw new Error(`할 일 체크 실패: ${lockErr.message}`);
  if (!data) return;

  if (done) {
    // 기록에 initiative_id 를 남긴다(013). 예전엔 이게 없어서 해제할 때 지울 열쇠가 없었고,
    // 체크↔해제를 반복하면 유령 기록이 계속 쌓였다.
    const oid = (form.get('objective_id') as string)?.trim() || null;
    await run('체크 기록', () =>
      db().from('session_logs').insert({
        objective_id: oid, area_id: data.area_id ?? null, initiative_id: id,
        kind: 'check', note: data.title ?? null,
      }),
    );
  } else {
    // 체크가 남긴 기록을 지운다 — 완료가 만든 것과 짝이 맞아야 한다.
    const { revertKrLogsWhere } = await import('../kr-ledger');
    await revertKrLogsWhere({ initiativeId: id });
  }
  const oid = (form.get('objective_id') as string)?.trim();
  revalidatePath(oid ? `/okr/${oid}` : '/okr');
  revalidatePath('/');
}

// 목표 매듭짓기 — 완료/그만두기. 기록은 남고 목록에서만 내려간다.
export async function setGoalStatus(payload: { id: string; status: 'active' | 'done' | 'dropped' }) {
  const id = must(payload.id, '목표');
  if (!['active', 'done', 'dropped'].includes(payload.status)) throw new Error('허용되지 않은 상태');
  await run('목표 상태 변경', () => db().from('objectives').update({ status: payload.status }).eq('id', id));
  revalidatePath('/okr');
  revalidatePath(`/okr/${id}`);
  revalidatePath('/');
}
