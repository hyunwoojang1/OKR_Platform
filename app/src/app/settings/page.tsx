import NotificationToggle from './NotificationToggle';
import AreaManager from './AreaManager';
import { db } from '@/lib/db';
import type { Area } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // 보관된 것도 보여준다 — 되살리려면 목록에 있어야 하니까.
  const { data, error } = await db().from('areas').select('*').order('sort_order').order('name');
  if (error) throw new Error(`영역 조회 실패: ${error.message}`);
  const areas = (data ?? []) as Area[];

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <h1 className="t-large">설정</h1>

      <AreaManager areas={areas} />

      <section className="tile">
        <h2 className="tile-title">알림</h2>
        <p className="mb-3 text-xs opacity-60">아침 7시 브리핑 · 저녁 9시 마감 리마인더를 푸시로 받아요.</p>
        <NotificationToggle />
      </section>

      <section className="tile">
        <h2 className="tile-title">Google 연동</h2>
        <p className="text-xs opacity-60">
          Google 로그인 겸 캘린더 양방향 동기화.
          {process.env.GOOGLE_CLIENT_ID ? ' 크리덴셜 등록됨 ✓ — 로그인 1회로 캘린더가 연결돼요.' : ' OAuth 크리덴셜 대기 중.'}
        </p>
      </section>

      <section className="tile">
        <h2 className="tile-title">계정</h2>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="text-sm opacity-60 underline">로그아웃</button>
        </form>
      </section>
    </main>
  );
}
