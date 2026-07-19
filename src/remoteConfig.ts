// 원격 킬스위치 — 재검수(영업일 3~5일) 없이 조정 가능한 기능 플래그 (플레이북 §0).
//
// 앱인토스는 클라 재배포마다 재검수를 거치므로 "즉시 핫픽스"가 물리적으로 불가능하다.
// 문제가 된 기능을 서버에서 끄거나 완화하는 게 유일한 즉시 대응 수단.
//
// 원칙:
//   - **sim 값은 절대 원격화하지 않는다** — 결정론·공정성(같은 시드 = 같은 게임) 침해.
//     렌더 연출·기능 on/off·업로드 게이트만.
//   - fetch 실패/미적용 DB = 아래 코드 기본값으로 동작 (완전 폴백, 게임 영향 없음)
//   - 부트 시 1회 fire-and-forget 로드 — 플래그 소비 시점(예: 정전 트랩 1,000m+)은
//     로드 완료보다 충분히 늦다.
import { getSupabaseClient } from './supabaseClient';

const CONFIG_TIMEOUT_MS = 3000;

// 기본값 = 스위치를 못 읽었을 때의 동작. 타입이 곧 스키마 — 원격 값이 타입 불일치면 무시.
const DEFAULTS = {
  /** 정전(연막) 트랩 on/off — 난이도 민원·버그 시 1차 킬스위치 */
  blackout_enabled: true,
  /** 연막 솔리드 차단 시작 x 비율 (0.7 = 우측 30% 차단) — 난이도 원격 조정 */
  blackout_edge_ratio: 0.7,
  /** 봇 로그 원격 업로드 게이트 — 봇이 프로덕션 보드를 오염시킬 때 차단 */
  bot_upload_enabled: true,
} as const;

export type RemoteConfigKey = keyof typeof DEFAULTS;

let overrides: Partial<Record<RemoteConfigKey, unknown>> = {};

/** 부트 시 1회 호출 (비차단). remote_config 테이블 전체를 읽어 override 캐시. */
export async function loadRemoteConfig(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const { data, error } = (await client
      .from('remote_config')
      .select('key, value')
      .abortSignal(controller.signal)) as {
      data: { key: string; value: unknown }[] | null;
      error: unknown;
    };
    clearTimeout(timer);
    if (error || !data) return; // 테이블 미적용(migrations/003 이전)·장애 — 기본값 유지
    const next: Partial<Record<RemoteConfigKey, unknown>> = {};
    for (const row of data) {
      if (row.key in DEFAULTS) next[row.key as RemoteConfigKey] = row.value;
    }
    overrides = next;
  } catch {
    clearTimeout(timer);
    // 기본값 유지 — 원격 config는 없어도 되는 레이어
  }
}

/** 플래그 조회 — 원격 값이 있고 타입이 기본값과 일치할 때만 적용. */
export function remoteConfig<K extends RemoteConfigKey>(key: K): (typeof DEFAULTS)[K] {
  const v = overrides[key];
  if (v !== undefined && typeof v === typeof DEFAULTS[key]) {
    return v as (typeof DEFAULTS)[K];
  }
  return DEFAULTS[key];
}

/** 테스트 전용 — override 상태 초기화 */
export function resetRemoteConfigForTest(): void {
  overrides = {};
}
