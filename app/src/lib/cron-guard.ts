import { NextRequest } from 'next/server';
import { config } from './config';

// 크론 라우트 게이트: CRON_SECRET 미설정이면 전면 차단(fail-closed).
// Vercel Cron은 CRON_SECRET env가 있으면 Authorization: Bearer 로 자동 첨부한다.
export function cronAuthorized(req: NextRequest): boolean {
  if (!config.cronSecret) return false;
  const header = req.headers.get('authorization');
  if (header === `Bearer ${config.cronSecret}`) return true;
  // 수동 테스트용: ?secret= (로컬 검증 편의)
  return req.nextUrl.searchParams.get('secret') === config.cronSecret;
}
