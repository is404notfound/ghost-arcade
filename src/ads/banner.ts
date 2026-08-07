// 앱인토스 WebView 배너 — DOM 슬롯 + TossAds. 웹/미지원은 no-op.
import { isAppsInTossHost } from '../aitHost';

const BANNER_EL_ID = 'ait-banner';
const BANNER_HEIGHT_PX = 96;
const TEST_BANNER_ID = 'ait-ad-test-banner-id';

type BannerHandle = { destroy: () => void };

let initialized = false;
let handle: BannerHandle | null = null;

function bannerAdGroupId(): string {
  return (
    (import.meta.env.VITE_AD_GROUP_BANNER as string | undefined) || TEST_BANNER_ID
  );
}

function setCssSlot(active: boolean): void {
  document.documentElement.style.setProperty(
    '--banner-h',
    active ? `${BANNER_HEIGHT_PX}px` : '0px',
  );
  const el = document.getElementById(BANNER_EL_ID);
  if (el) el.hidden = !active;
  // Phaser FIT이 game-root 크기 변화를 반영하도록
  window.dispatchEvent(new Event('resize'));
}

/** 전면/보상형 표시 중 배너 가림 — 터치·레이어 충돌 방지 */
export function setBannerVisible(show: boolean): void {
  const el = document.getElementById(BANNER_EL_ID);
  if (!el || !handle) return;
  el.style.visibility = show ? 'visible' : 'hidden';
  el.style.pointerEvents = show ? 'auto' : 'none';
}

export function destroyBanner(): void {
  try {
    handle?.destroy();
  } catch {
    /* SDK 미지원 */
  }
  handle = null;
  setCssSlot(false);
}

/**
 * remoteConfig 이후 1회. 실패·미지원·웹은 조용히 스킵.
 */
export async function mountBannerIfEnabled(enabled: boolean): Promise<void> {
  if (!__ADS_ENABLED__) return;
  if (!enabled) {
    destroyBanner();
    return;
  }
  if (!isAppsInTossHost()) return;

  const el = document.getElementById(BANNER_EL_ID);
  if (!el) return;

  try {
    const { TossAds } = await import('@apps-in-toss/web-framework');
    if (!TossAds.initialize.isSupported() || !TossAds.attachBanner.isSupported()) {
      return;
    }

    const ensureInit = (): Promise<void> =>
      new Promise((resolve, reject) => {
        if (initialized) {
          resolve();
          return;
        }
        TossAds.initialize({
          callbacks: {
            onInitialized: () => {
              initialized = true;
              resolve();
            },
            onInitializationFailed: (error) => {
              reject(error instanceof Error ? error : new Error(String(error)));
            },
          },
        });
      });

    await ensureInit();
    destroyBanner();
    el.innerHTML = '';
    el.hidden = false;

    handle = TossAds.attachBanner(bannerAdGroupId(), el, {
      theme: 'dark',
      tone: 'blackAndWhite',
      variant: 'expanded',
      callbacks: {
        onAdRendered: () => {
          setCssSlot(true);
          setBannerVisible(true);
        },
        onNoFill: () => {
          setCssSlot(false);
        },
        onAdFailedToRender: () => {
          setCssSlot(false);
        },
      },
    });
    setBannerVisible(true);
  } catch {
    destroyBanner();
  }
}
