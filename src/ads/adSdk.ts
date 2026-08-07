// 주입 가능한 광고 SDK 경계 (결정 M).
// 실패·미준비·중도이탈은 실기기 QR로 재현하기 어려워 테스트에서 가짜 AdSdk를 쓴다.

export type ShowEvent =
  | { type: 'userEarnedReward' }
  | { type: 'dismissed' }
  | { type: 'failedToShow' }
  | { type: 'show' }
  | { type: 'clicked' }
  | { type: 'impression' }
  | { type: 'requested' };

export interface AdSdk {
  isSupported(): boolean;
  /** 동적 import 완료 — isSupported()가 의미 있게 되기 전 호출 */
  ensure?(): Promise<void>;
  load(
    adGroupId: string,
    onEvent: (t: 'loaded') => void,
    onError: (e: Error) => void,
  ): () => void;
  show(
    adGroupId: string,
    onEvent: (e: ShowEvent) => void,
    onError: (e: Error) => void,
  ): () => void;
}

type TossMod = typeof import('@apps-in-toss/web-framework');

/** 앱인토스 web-framework 동적 import 어댑터. */
export function createTossAdSdk(): AdSdk {
  let mod: TossMod | null = null;
  let ensuring: Promise<void> | null = null;

  const ensure = (): Promise<void> => {
    if (mod) return Promise.resolve();
    if (!ensuring) {
      ensuring = import('@apps-in-toss/web-framework')
        .then((m) => {
          mod = m;
        })
        .catch((e: unknown) => {
          ensuring = null;
          throw e instanceof Error ? e : new Error(String(e));
        });
    }
    return ensuring;
  };

  return {
    ensure,
    isSupported(): boolean {
      if (!mod) return false;
      try {
        return mod.loadFullScreenAd.isSupported() && mod.showFullScreenAd.isSupported();
      } catch {
        return false;
      }
    },
    load(adGroupId, onEvent, onError) {
      let cancelled = false;
      let unregister: (() => void) | null = null;
      void ensure()
        .then(() => {
          if (cancelled || !mod) return;
          unregister = mod.loadFullScreenAd({
            options: { adGroupId },
            onEvent: (ev) => {
              if (ev.type === 'loaded') onEvent('loaded');
            },
            onError,
          });
        })
        .catch((e: unknown) => {
          onError(e instanceof Error ? e : new Error(String(e)));
        });
      return () => {
        cancelled = true;
        unregister?.();
      };
    },
    show(adGroupId, onEvent, onError) {
      let cancelled = false;
      let unregister: (() => void) | null = null;
      void ensure()
        .then(() => {
          if (cancelled || !mod) return;
          unregister = mod.showFullScreenAd({
            options: { adGroupId },
            onEvent: (ev) => {
              onEvent({ type: ev.type });
            },
            onError,
          });
        })
        .catch((e: unknown) => {
          onError(e instanceof Error ? e : new Error(String(e)));
        });
      return () => {
        cancelled = true;
        unregister?.();
      };
    },
  };
}
