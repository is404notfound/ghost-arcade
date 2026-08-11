// 광고 파사드 — 웹/미지원 환경은 전부 no-op. 빌드 플래그로 DCE.
import { isAppsInTossHost } from '../aitHost';
import { createTossAdSdk, type AdSdk, type ShowEvent } from './adSdk';

export type AdKind = 'revive' | 'interstitial';

export type AdResult =
  | { type: 'rewarded' }
  | { type: 'dismissed' }
  | { type: 'unavailable'; reason: string };

/** 개발·QR: 테스트 ID. 운영 ID는 VITE_AD_GROUP_* 로 덮어쓴다. */
const TEST_IDS: Record<AdKind, string> = {
  revive: 'ait-ad-test-rewarded-id',
  interstitial: 'ait-ad-test-interstitial-id',
};

function adGroupId(kind: AdKind): string {
  if (kind === 'revive') {
    return (import.meta.env.VITE_AD_GROUP_REVIVE as string | undefined) || TEST_IDS.revive;
  }
  return (import.meta.env.VITE_AD_GROUP_INTERSTITIAL as string | undefined) || TEST_IDS.interstitial;
}

let sdk: AdSdk = createTossAdSdk();
const ready = new Set<AdKind>();
const loading = new Set<AdKind>();
let adSessionActive = false;

/** 테스트 전용 — 가짜 AdSdk 주입 */
export function __setAdSdkForTest(next: AdSdk): void {
  sdk = next;
  ready.clear();
  loading.clear();
}

export function __resetAdsForTest(): void {
  sdk = createTossAdSdk();
  ready.clear();
  loading.clear();
  adSessionActive = false;
}

export function isAdSessionActive(): boolean {
  return adSessionActive;
}

export function setAdSessionActive(v: boolean): void {
  adSessionActive = v;
}

export function isAdsAvailable(): boolean {
  if (!__ADS_ENABLED__) return false;
  if (!isAppsInTossHost()) return false;
  return sdk.isSupported();
}

export function isAdReady(kind: AdKind): boolean {
  return ready.has(kind);
}

/** 이어뛰기 게이트 진단 — PostHog game_over.revive_skip_reason 용. */
export function reviveOfferSkipReason(reviveEnabled: boolean): string | null {
  if (!__ADS_ENABLED__) return 'build_disabled';
  if (!isAppsInTossHost()) return 'not_ait_host';
  if (!sdk.isSupported()) return 'unsupported';
  if (!reviveEnabled) return 'remote_disabled';
  if (!ready.has('revive')) return 'not_ready';
  return null;
}

/** 사망 시 not_ready면 이 시간만큼 조용히 대기(재-preload 포함). */
export const REVIVE_READY_WAIT_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * preload를 한 번 더 걸고 timeoutMs 안에 ready가 되면 true.
 * 실패·타임아웃 후 loading 플래그를 풀어 다음 startRun/사망에서 재시도 가능하게 한다.
 */
export async function waitForAdReady(
  kind: AdKind,
  timeoutMs: number = REVIVE_READY_WAIT_MS,
): Promise<boolean> {
  if (ready.has(kind)) return true;
  preload(kind);
  if (ready.has(kind)) return true;

  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < deadline) {
    await sleep(50);
    if (ready.has(kind)) return true;
  }

  // SDK가 콜백을 안 주는 경우 loading에 영구 고정되면 이후 preload가 전부 no-op.
  if (!ready.has(kind)) loading.delete(kind);
  return false;
}

/** 부트 완료 + remoteConfig 이후 호출. dismiss 직후·판 시작·사망 대기에서도 재시도. */
export function preload(kind: AdKind): void {
  if (!__ADS_ENABLED__) return;
  if (!isAppsInTossHost()) return;
  if (loading.has(kind) || ready.has(kind)) return;

  const start = () => {
    if (!sdk.isSupported()) return;
    loading.add(kind);
    const id = adGroupId(kind);
    sdk.load(
      id,
      () => {
        loading.delete(kind);
        ready.add(kind);
      },
      () => {
        loading.delete(kind);
        ready.delete(kind);
      },
    );
  };

  if (sdk.ensure) {
    void sdk.ensure().then(start).catch(() => {
      /* 미지원/네트워크 — 조용히. loading 미진입이라 다음 preload로 재시도 가능 */
    });
  } else {
    start();
  }
}

export function preloadAllEnabled(opts: {
  reviveEnabled: boolean;
  interstitialEnabled: boolean;
}): void {
  if (opts.reviveEnabled) preload('revive');
  if (opts.interstitialEnabled) preload('interstitial');
}

/**
 * 광고 표시. rewarded만 보상 지급. interstitial은 dismissed/rewarded/unavailable 모두 재시작 진행.
 */
export function show(kind: AdKind): Promise<AdResult> {
  if (!__ADS_ENABLED__) {
    return Promise.resolve({ type: 'unavailable', reason: 'build_disabled' });
  }
  if (!isAppsInTossHost()) {
    return Promise.resolve({ type: 'unavailable', reason: 'not_ait_host' });
  }
  if (!sdk.isSupported()) {
    return Promise.resolve({ type: 'unavailable', reason: 'unsupported' });
  }
  if (!ready.has(kind)) {
    return Promise.resolve({ type: 'unavailable', reason: 'not_ready' });
  }

  ready.delete(kind);
  const id = adGroupId(kind);
  const t0 = Date.now();

  return new Promise<AdResult>((resolve) => {
    let settled = false;
    let earned = false;
    adSessionActive = true;

    const finish = (result: AdResult) => {
      if (settled) return;
      settled = true;
      adSessionActive = false;
      unregister();
      // 다음 노출을 위해 재-preload
      preload(kind);
      void t0; // latency는 호출부 계측에서 Date.now()-t0 사용 가능하도록 showStartedAt 노출 대신
      resolve(result);
    };

    const unregister = sdk.show(
      id,
      (ev: ShowEvent) => {
        if (ev.type === 'userEarnedReward') {
          earned = true;
          // 보상형은 reward 후 dismissed가 올 수 있음 — reward면 즉시 rewarded
          if (kind === 'revive') finish({ type: 'rewarded' });
        } else if (ev.type === 'dismissed') {
          if (earned || kind === 'interstitial') {
            finish(earned ? { type: 'rewarded' } : { type: 'dismissed' });
          } else {
            finish({ type: 'dismissed' });
          }
        } else if (ev.type === 'failedToShow') {
          finish({ type: 'unavailable', reason: 'failed_to_show' });
        }
      },
      (e) => {
        finish({ type: 'unavailable', reason: e.message || 'show_error' });
      },
    );
  });
}

export type { AdSdk, ShowEvent };
export {
  shouldShowInterstitial,
  normalizeInterstitialPeriod,
  readInterstitialState,
  writeInterstitialState,
  utcDateKey,
  INTERSTITIAL_STORAGE_KEY,
} from './interstitialGate';
export type { InterstitialState, ShouldShowInterstitialInput } from './interstitialGate';
export {
  mountBannerIfEnabled,
  setBannerVisible,
  destroyBanner,
  shouldMountBannerForViewport,
  BANNER_HEIGHT_PX,
  DEFAULT_BANNER_MIN_VIEWPORT_H,
} from './banner';
export type { MountBannerOptions } from './banner';
