import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

// 서버 전용 클라이언트(service_role, goalhub 스키마). 클라이언트 컴포넌트에서 import 금지.
// supabase-js 제네릭 슬롯(Database·Schema). `supabase gen types` 로 스키마 타입을
// 만들지 않는 한 여기 넣을 수 있는 게 없다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoalhubClient = SupabaseClient<any, any, 'goalhub', any, any>;
let cached: GoalhubClient | null = null;

export function db(): GoalhubClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      db: { schema: 'goalhub' },
      auth: { persistSession: false, autoRefreshToken: false },
      // Next.js 데이터 캐시가 GET을 물고 stale을 돌려주는 것 방지 — 항상 실시간 조회
      global: { fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }) },
    });
  }
  return cached;
}
