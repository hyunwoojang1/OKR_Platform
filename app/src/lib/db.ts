import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

// 서버 전용 클라이언트(service_role, goalhub 스키마). 클라이언트 컴포넌트에서 import 금지.
type GoalhubClient = SupabaseClient<any, any, 'goalhub', any, any>;
let cached: GoalhubClient | null = null;

export function db(): GoalhubClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      db: { schema: 'goalhub' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
