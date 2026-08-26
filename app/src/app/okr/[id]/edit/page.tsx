import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import type { Area, Initiative, KeyResult, Objective } from '@/lib/types';
import EditGoalForm from './EditGoalForm';

export const dynamic = 'force-dynamic';

// 목표 편집: 위저드 4단계를 한 페이지에 세로로 펼친 화면. 값이 미리 채워져 있다.
export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [objQ, krQ, iniQ, areaQ] = await Promise.all([
    db().from('objectives').select('*').eq('id', id).maybeSingle(),
    db().from('key_results').select('*').eq('objective_id', id).order('created_at'),
    db().from('initiatives').select('*').eq('objective_id', id).order('week_of'),
    db().from('areas').select('*').eq('archived', false).order('sort_order'),
  ]);
  if (objQ.error) throw new Error(`목표 조회 실패: ${objQ.error.message}`);
  const obj = objQ.data as Objective | null;
  if (!obj) notFound();
  for (const q of [krQ, iniQ, areaQ]) {
    if (q.error) throw new Error(`편집 조회 실패: ${q.error.message}`);
  }

  return (
    <EditGoalForm
      goal={obj}
      krs={krQ.data as KeyResult[]}
      initiatives={iniQ.data as Initiative[]}
      areas={areaQ.data as Area[]}
    />
  );
}
