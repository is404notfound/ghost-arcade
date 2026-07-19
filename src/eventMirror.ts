// PostHog 이중화 미러 — 최소 이벤트를 Supabase event_mirror 테이블에도 기록.
//
// 배경 (플레이북 §0): 앱인토스 검수에서 PostHog 키를 끄고 출시할 가능성이 있고,
// 그 경우 판정표 지표 대부분이 측정 불가가 된다. game_start·abnormal_exit 같은
// 최소 이벤트를 Supabase에 미러링해 "축소판 기준표"의 데이터 소스를 확보한다.
// (game_over는 ghost_runs 테이블 자체가 이미 미러 역할 — user_id·distance·created_at 보유)
//
// 원칙: fire-and-forget, 실패 완전 무시 — 미러링 실패 ≠ 게임 영향. Sentry 보고도 안 한다
// (계측 인프라의 계측은 소음이 된다).
import { getSupabaseClient } from './supabaseClient';

const MIRROR_TIMEOUT_MS = 4000;

export function mirrorEvent(
  event: string,
  userId?: string,
  props?: Record<string, unknown>,
): void {
  try {
    const client = getSupabaseClient();
    if (!client) return;
    const insert = client.from('event_mirror').insert({
      event,
      user_id: userId ?? null,
      props: props ?? {},
    }) as unknown as Promise<{ error: unknown }>;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('mirror timeout')), MIRROR_TIMEOUT_MS),
    );
    void Promise.race([insert, timeout]).catch(() => {
      /* 미러 실패 — 조용히 무시 */
    });
  } catch {
    /* 조용히 무시 */
  }
}
