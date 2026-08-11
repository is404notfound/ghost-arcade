import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdSdk, ShowEvent } from '../adSdk';

vi.mock('../../aitHost', () => ({
  isAppsInTossHost: vi.fn(() => true),
}));

// vitest define 기본은 false — 테스트에서 강제 true
vi.stubGlobal('__ADS_ENABLED__', true);

async function loadFacade() {
  return import('../index');
}

function makeFakeSdk(opts: {
  supported?: boolean;
  loadOk?: boolean;
  /** load 성공 콜백 지연(ms). 기본 0 = microtask */
  loadDelayMs?: number;
  showEvents?: ShowEvent[];
  showError?: Error;
}): AdSdk {
  const supported = opts.supported ?? true;
  const loadDelayMs = opts.loadDelayMs ?? 0;
  return {
    isSupported: () => supported,
    load(_id, onEvent, onError) {
      const fire = () => {
        if (opts.loadOk === false) {
          onError(new Error('load fail'));
        } else {
          onEvent('loaded');
        }
      };
      if (loadDelayMs > 0) {
        setTimeout(fire, loadDelayMs);
      } else {
        queueMicrotask(fire);
      }
      return () => {};
    },
    show(_id, onEvent, onError) {
      if (opts.showError) {
        queueMicrotask(() => onError(opts.showError!));
      } else {
        for (const ev of opts.showEvents ?? [{ type: 'dismissed' }]) {
          queueMicrotask(() => onEvent(ev));
        }
      }
      return () => {};
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('__ADS_ENABLED__', true);
});

describe('ads facade', () => {
  it('빌드 플래그 off → unavailable', async () => {
    vi.stubGlobal('__ADS_ENABLED__', false);
    const { show, __setAdSdkForTest } = await loadFacade();
    __setAdSdkForTest(makeFakeSdk({}));
    const r = await show('revive');
    expect(r).toEqual({ type: 'unavailable', reason: 'build_disabled' });
  });

  it('웹 호스트 → unavailable', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(false);
    const { show, __setAdSdkForTest } = await loadFacade();
    __setAdSdkForTest(makeFakeSdk({}));
    const r = await show('revive');
    expect(r.type).toBe('unavailable');
  });

  it('sdk.isSupported false → unavailable', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { show, __setAdSdkForTest, isAdsAvailable } = await loadFacade();
    __setAdSdkForTest(makeFakeSdk({ supported: false }));
    expect(isAdsAvailable()).toBe(false);
    const r = await show('revive');
    expect(r).toEqual({ type: 'unavailable', reason: 'unsupported' });
  });

  it('미준비 show → unavailable', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { show, __setAdSdkForTest } = await loadFacade();
    __setAdSdkForTest(makeFakeSdk({}));
    const r = await show('revive');
    expect(r).toEqual({ type: 'unavailable', reason: 'not_ready' });
  });

  it('rewarded / dismissed', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { preload, show, __setAdSdkForTest, isAdReady } = await loadFacade();

    __setAdSdkForTest(
      makeFakeSdk({ showEvents: [{ type: 'userEarnedReward' }, { type: 'dismissed' }] }),
    );
    preload('revive');
    await vi.waitFor(() => expect(isAdReady('revive')).toBe(true));
    expect(await show('revive')).toEqual({ type: 'rewarded' });

    __setAdSdkForTest(makeFakeSdk({ showEvents: [{ type: 'dismissed' }] }));
    preload('revive');
    await vi.waitFor(() => expect(isAdReady('revive')).toBe(true));
    expect(await show('revive')).toEqual({ type: 'dismissed' });
  });

  it('load onError → ready 안 됨', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { preload, isAdReady, __setAdSdkForTest } = await loadFacade();
    __setAdSdkForTest(makeFakeSdk({ loadOk: false }));
    preload('revive');
    await new Promise((r) => setTimeout(r, 20));
    expect(isAdReady('revive')).toBe(false);
  });

  it('waitForAdReady: 이미 ready면 즉시 true', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { preload, waitForAdReady, __setAdSdkForTest, isAdReady } =
      await loadFacade();
    __setAdSdkForTest(makeFakeSdk({}));
    preload('revive');
    await vi.waitFor(() => expect(isAdReady('revive')).toBe(true));
    await expect(waitForAdReady('revive', 1000)).resolves.toBe(true);
  });

  it('waitForAdReady: 지연 load가 timeout 안이면 true', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { waitForAdReady, __setAdSdkForTest, isAdReady } = await loadFacade();
    __setAdSdkForTest(makeFakeSdk({ loadDelayMs: 120 }));
    await expect(waitForAdReady('revive', 500)).resolves.toBe(true);
    expect(isAdReady('revive')).toBe(true);
  });

  it('waitForAdReady: timeout 후 false + 이후 preload 재시도 가능', async () => {
    const { isAppsInTossHost } = await import('../../aitHost');
    vi.mocked(isAppsInTossHost).mockReturnValue(true);
    const { waitForAdReady, preload, __setAdSdkForTest, isAdReady } =
      await loadFacade();

    __setAdSdkForTest(makeFakeSdk({ loadOk: false }));
    await expect(waitForAdReady('revive', 80)).resolves.toBe(false);
    expect(isAdReady('revive')).toBe(false);

    __setAdSdkForTest(makeFakeSdk({ loadOk: true }));
    preload('revive');
    await vi.waitFor(() => expect(isAdReady('revive')).toBe(true));
  });
});
