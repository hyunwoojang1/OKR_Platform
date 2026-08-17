// 로그인 화면 (AUTH_MODE=google일 때만 도달. dev 모드에선 미들웨어가 우회 세션 발급)
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">목표 허브</h1>
        <p className="mt-2 text-sm opacity-60">지정된 Google 계정으로만 입장할 수 있습니다</p>
      </div>
      <a
        href="/api/auth/login"
        className="rounded-full border px-6 py-3 text-sm font-medium transition hover:shadow-md"
      >
        Google로 로그인
      </a>
    </main>
  );
}
