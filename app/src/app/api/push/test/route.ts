import { NextResponse } from 'next/server';
import { sendPushToAll } from '@/lib/push';

// 설정 화면의 「테스트 알림」 버튼용 (세션은 proxy가 보장)
export async function POST() {
  try {
    const result = await sendPushToAll({
      title: '목표 허브 테스트',
      body: '알림이 정상 작동해요 🎯',
      url: '/',
      tag: 'test',
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
