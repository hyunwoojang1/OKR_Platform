// 목표 계열화 — "연결하는 일 자체를 없앤다" (홈 그릴 확정, docs/GOAL_HIERARCHY_SPEC.md)
// ① 휴리스틱 프리필터(같은 영역·기한 정합) → ② 로컬 AI(Ollama)가 의미로 판단 → ③ 실패 시 휴리스틱 폴백.
// AI 출력은 반드시 구조 검증 — 인덱스 범위 밖·비JSON이면 폴백으로 강등. 서버 전용.
import { db } from './db';
import type { Objective } from './types';

export type ParentCandidate = { id: string; title: string; dueDate: string | null };
export type ParentSuggestion = {
  parentId: string | null;
  parentTitle: string | null;
  confidence: 'high' | 'low';
  engine: string; // 'ai(...)' | 'heuristic' | 'none'
};

const AUTO_KR_TITLE = '소목표 달성';
const LLM_TIMEOUT_MS = 25_000;

// ── ① 프리필터: 같은 영역의 활성 목표 중, 기한이 새 목표보다 뒤(또는 무기한)인 것만 대목표 후보 ──
export function prefilterCandidates(
  candidates: ParentCandidate[],
  newDueDate: string | null,
): ParentCandidate[] {
  return candidates.filter((c) => {
    if (!newDueDate || !c.dueDate) return true;
    return c.dueDate >= newDueDate; // 소목표 기한이 대목표 마감을 넘으면 자격 없음
  });
}

// ── ② AI 판단 + ③ 폴백 ──
export async function suggestParent(
  newGoal: { title: string; dueDate: string | null },
  candidates: ParentCandidate[],
): Promise<ParentSuggestion> {
  const filtered = prefilterCandidates(candidates, newGoal.dueDate).slice(0, 8);
  if (filtered.length === 0) {
    return { parentId: null, parentTitle: null, confidence: 'high', engine: 'none' };
  }

  // 휴리스틱 폴백: 후보가 하나뿐이면 낮은 확신으로 그것을 제안 (검토 화면에서 토글로 거부 가능)
  const fallback: ParentSuggestion =
    filtered.length === 1
      ? { parentId: filtered[0].id, parentTitle: filtered[0].title, confidence: 'low', engine: 'heuristic' }
      : { parentId: null, parentTitle: null, confidence: 'low', engine: 'heuristic' };

  try {
    const { chatCompleteJson } = await import('./llm');
    const list = filtered
      .map((c, i) => `${i}. "${c.title}"${c.dueDate ? ` (기한 ${c.dueDate})` : ''}`)
      .join('\n');
    const { content, engine, model } = await chatCompleteJson(
      [
        {
          role: 'system',
          content:
            // 검증 2026-08-24: 확장 표본 8/8 (양성4·음성3·헷갈림1 — exaone3.5:7.8b). 수정 시 재검증할 것.
            '너는 목표 계층 분류기다. 새 목표가 기존 목표 중 하나의 하위 목표(소목표)인지 판단한다. ' +
            '하위 목표 = 그 자체가 상위 목표의 일부인 목표. 상위 목표를 쪼갠 조각이어야 한다. ' +
            '"도움이 된다"는 하위가 아니다 — 포함 관계여야 한다. ' +
            '여러 후보가 관련돼 보이면, 새 목표를 부분으로 포함하는 가장 구체적이고 좁은 후보를 골라라. ' +
            '예1: "신한은행 서류 합격"은 "하반기 금융권 공채 합격"의 하위 목표다(공채 지원의 일부). ' +
            '예2: "정보처리기사 필기 합격"은 "정보처리기사 취득"의 하위 목표이지, "대기업 취업"의 하위 목표가 아니다 — 취업에 도움은 되지만 취업의 일부는 아니고, 자격증 취득의 일부다. ' +
            '예3: "벤치 70kg 달성"은 "공채 합격"의 하위 목표가 아니다(무관). ' +
            '반드시 JSON 객체 하나만 출력: {"parent_index": 숫자, "confidence": "high"|"low"}. ' +
            '하위 목표가 아니거나 애매하면 parent_index는 -1.',
        },
        {
          role: 'user',
          content: `새 목표: "${newGoal.title.slice(0, 200)}"${newGoal.dueDate ? ` (기한 ${newGoal.dueDate})` : ''}\n기존 목표 목록:\n${list}\n이 새 목표는 위 목록 중 어느 것의 하위 목표인가? JSON으로.`,
        },
      ],
      LLM_TIMEOUT_MS,
    );

    const parsed = JSON.parse(content) as { parent_index?: unknown; confidence?: unknown };
    const idx = Number(parsed.parent_index);
    if (!Number.isInteger(idx) || idx < -1 || idx >= filtered.length) return fallback;
    const confidence = parsed.confidence === 'high' ? 'high' : 'low';
    if (idx === -1) return { parentId: null, parentTitle: null, confidence, engine: `ai(${model})` };
    return { parentId: filtered[idx].id, parentTitle: filtered[idx].title, confidence, engine: `ai(${engine === 'ollama' ? model : 'groq'})` };
  } catch {
    return fallback;
  }
}

// ── 롤업: 대목표의 "소목표 달성 n/m" 지표를 자동 생성·갱신 ──
export async function ensureGoalAggKR(parentId: string): Promise<void> {
  const { data: children, error } = await db()
    .from('objectives').select('id,status').eq('parent_id', parentId);
  if (error) throw new Error(`소목표 조회 실패: ${error.message}`);
  const total = (children ?? []).length;
  const done = (children ?? []).filter((c) => c.status === 'done').length;
  if (total === 0) return;

  const { data: existing, error: krErr } = await db()
    .from('key_results').select('id').eq('objective_id', parentId).eq('source', 'goal_agg').maybeSingle();
  if (krErr) throw new Error(`집계 지표 조회 실패: ${krErr.message}`);

  if (existing) {
    const { error: upErr } = await db()
      .from('key_results').update({ target_value: total, current_value: done }).eq('id', existing.id);
    if (upErr) throw new Error(`집계 지표 갱신 실패: ${upErr.message}`);
  } else {
    const { error: insErr } = await db().from('key_results').insert({
      objective_id: parentId,
      title: AUTO_KR_TITLE,
      target_value: total,
      current_value: done,
      unit: '개',
      source: 'goal_agg',
    });
    if (insErr) throw new Error(`집계 지표 생성 실패: ${insErr.message}`);
  }
}

// 소목표 완료 → 대목표 지표 갱신 + 물결 로그 (홈·달력·기록에 흐른다). 실패해도 완료 자체는 유지.
export async function completeChildRollup(childId: string): Promise<void> {
  try {
    const { data } = await db()
      .from('objectives').select('id,title,parent_id,area_id').eq('id', childId).maybeSingle();
    const child = data as Pick<Objective, 'id' | 'title' | 'area_id'> & { parent_id: string | null } | null;
    if (!child?.parent_id) return;
    await ensureGoalAggKR(child.parent_id);
    const { error } = await db().from('session_logs').insert({
      objective_id: child.parent_id,
      area_id: child.area_id,
      kind: 'check',
      note: `소목표 달성 — ${child.title}`,
    });
    if (error) throw new Error(`소목표 달성 기록 실패: ${error.message}`);
  } catch (e) {
    console.error('[goal-rollup]', e);
  }
}
