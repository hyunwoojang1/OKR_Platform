import NotificationToggle from './NotificationToggle';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <main className="space-y-4">
      <h1 className="t-large">설정</h1>

      <section className="tile">
        <h2 className="tile-title">알림</h2>
        <p className="mb-3 text-xs opacity-60">아침 7시 브리핑 · 저녁 9시 마감 리마인더를 푸시로 받아요.</p>
        <NotificationToggle />
      </section>

      <section className="tile">
        <h2 className="tile-title">Google 연동</h2>
        <p className="text-xs opacity-60">
          캘린더 양방향 동기화 · Google 로그인은 OAuth 크리덴셜 등록 후 활성화돼요.
          {process.env.GOOGLE_CLIENT_ID ? ' (등록됨 ✓)' : ' (대기 중)'}
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
