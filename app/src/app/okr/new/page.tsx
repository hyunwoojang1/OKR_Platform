import { db } from '@/lib/db';
import type { Area } from '@/lib/types';
import GoalWizard from './GoalWizard';

export const dynamic = 'force-dynamic';

// v4 새 목표: 한 화면에 질문 하나씩 묻는 대화형 플로우.
// (AI 제안은 후속 — ANTHROPIC_API_KEY 연결 시 이 플로우의 선택지·주별 계획을 AI가 채운다)
export default async function NewGoalPage() {
  const [areasQ, evQ] = await Promise.all([
    db().from('areas').select('*').eq('archived', false).order('sort_order'),
    db().from('calendar_events').select('id').gte('starts_at', new Date().toISOString()).limit(100),
  ]);
  if (areasQ.error) throw new Error(`영역 조회 실패: ${areasQ.error.message}`);
  return <GoalWizard areas={(areasQ.data as Area[]) ?? []} upcomingCount={(evQ.data ?? []).length} />;
}
