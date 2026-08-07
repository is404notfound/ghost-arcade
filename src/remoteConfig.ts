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
  /** 이어뛰기(보상형) 광고 on/off. R2 fail-closed를 위해 기본 false */
  ads_revive_enabled: false,
  /** 전면광고 on/off. 원격에서 켠다 (fail-closed) */
  ads_interstitial_enabled: false,
  /** 전면광고 주기. 게이트에서 정규화됨 (결정 L) */
  ads_interstitial_period: 5,
  /** 전면광고 최소 lifetime_run_index (이 값 이상, 기본 5 = index > 4) */
  ads_interstitial_min_lifetime_run: 5,
  /** 인게임 하단 배너 on/off. 원격에서 켠다 (fail-closed) */
  ads_banner_enabled: false,
  /**
   * 배너 최소 뷰포트 높이(CSS px). 가로잠금에선 innerHeight.
   * 폰 가로(~375–430)는 미부착, 태블릿급만 부착. 원격 튜닝용.
   */
  ads_banner_min_viewport_h: 500,
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

/** JSONB/대시보드 입력에서 흔히 오는 문자열·숫자를 기본값 타입으로 정규화. */
function coerceRemoteValue(key: RemoteConfigKey, v: unknown): unknown {
  const sample = DEFAULTS[key];
  if (typeof sample === 'boolean') {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1) return true;
    if (v === 'false' || v === 0) return false;
    return undefined;
  }
  if (typeof sample === 'number') {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }
  return v;
}

/** 플래그 조회 — 원격 값이 있고 타입이 기본값과 일치할 때만 적용. */
export function remoteConfig<K extends RemoteConfigKey>(key: K): (typeof DEFAULTS)[K] {
  const raw = overrides[key];
  if (raw === undefined) return DEFAULTS[key];
  const v = coerceRemoteValue(key, raw);
  if (v !== undefined && typeof v === typeof DEFAULTS[key]) {
    return v as (typeof DEFAULTS)[K];
  }
  return DEFAULTS[key];
}

/** 테스트 전용 — override 상태 초기화 */
export function resetRemoteConfigForTest(): void {
  overrides = {};
}
