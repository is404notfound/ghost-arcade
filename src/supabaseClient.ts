import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Supabase 클라이언트 싱글턴.
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 미설정 시 null 반환 →
 * 호출부가 null 체크 후 localStorage 폴백으로 넘어간다.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return null;
  try {
    _client = createClient(url, key);
  } catch {
    return null;
  }
  return _client;
}
