import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cron-guard';
import { runCodingIngest } from '@/lib/coding-ingest';

export const maxDuration = 60;

// 노션 「푼 문제」 → 코테 지표. 실제 일은 lib/coding-ingest.ts 가 한다 —
// 오늘 할일의 '노션에서 가져오기' 버튼이 같은 함수를 쓰기 때문에 여기 두면 두 벌이 된다.
// 크론은 사람이 안 눌러도 값이 맞아야 하므로 지표까지 쓴다(writeKr 기본값 true).

function ingestAuthorized(req: NextRequest): boolean {
  const t = process.env.INGEST_TOKEN;
  if (!t) return false;
  if (req.headers.get('authorization') === `Bearer ${t}`) return true;
  return req.nextUrl.searchParams.get('key') === t;
}

export async function POST(req: NextRequest) {
  if (!ingestAuthorized(req) && !cronAuthorized(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return run();
}
// 크론은 GET으로 때린다
export async function GET(req: NextRequest) {
  if (!ingestAuthorized(req) && !cronAuthorized(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return run();
}

async function run() {
  try {
    return NextResponse.json({ ok: true, ...(await runCodingIngest()) });
  } catch (e) {
    console.error('ingest/coding 실패:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
