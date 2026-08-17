// 환경설정 단일 창구. 필수값은 기동 시점에 검증(fail-fast).
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 누락: ${name}`);
  return v;
}

export const config = {
  // 'dev' = 개발용 우회 세션(오늘 밤), 'google' = 실제 Google OAuth(크리덴셜 수령 후 전환)
  authMode: (process.env.AUTH_MODE ?? 'dev') as 'dev' | 'google',
  allowedEmail: process.env.ALLOWED_EMAIL ?? 'hyunwoojang99@gmail.com',
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY');
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  cronSecret: process.env.CRON_SECRET ?? '',
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:hyunwoojang99@gmail.com',
  },
};
