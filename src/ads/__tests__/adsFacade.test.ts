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
  showEvents?: ShowEvent[];
  showError?: Error;
}): AdSdk {
  const supported = opts.supported ?? true;
  return {
    isSupported: () => supported,
    load(_id, onEvent, onError) {
      if (opts.loadOk === false) {
        queueMicrotask(() => onError(new Error('load fail')));
      } else {
        queueMicrotask(() => onEvent('loaded'));
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
});
