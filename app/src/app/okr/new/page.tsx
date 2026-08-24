import { db } from '@/lib/db';
import type { Area } from '@/lib/types';
import GoalWizard from './GoalWizard';

export const dynamic = 'force-dynamic';

// v4 새 목표: 한 화면에 질문 하나씩 묻는 대화형 플로우.
// (AI 제안은 후속 — ANTHROPIC_API_KEY 연결 시 이 플로우의 선택지·주별 계획을 AI가 채운다)
export default async function NewGoalPage() {
  const [areasQ, evQ] = await Promise.all([
    db().from('areas').select('*').eq('archived', false).order('sort_order'),
    db()
      .from('calendar_events')
      .select('title, starts_at')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(50),
  ]);
  if (areasQ.error) throw new Error(`영역 조회 실패: ${areasQ.error.message}`);
  const upcoming = ((evQ.data ?? []) as { title: string; starts_at: string }[]).map((e) => ({
    title: e.title,
    date: new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10),
  }));
  return <GoalWizard areas={(areasQ.data as Area[]) ?? []} upcoming={upcoming} />;
}
