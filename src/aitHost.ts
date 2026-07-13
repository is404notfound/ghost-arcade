// 앱인토스(토스 미니앱) WebView 호스트 감지 + 가로 잠금.
// 일반 브라우저(로컬 Vite)에서는 브리지를 호출하지 않는다 — RN WebView가 없어 throw 하기 때문.

type TossWindow = Window & {
  ReactNativeWebView?: unknown;
  __appsInToss?: unknown;
};

/** 토스/샌드박스 WebView 안에서 뜨는지 (브리지 가능 여부) */
export function isAppsInTossHost(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as TossWindow;
  return !!(w.ReactNativeWebView || w.__appsInToss);
}

/**
 * 가로(landscape)로 화면 방향을 잠근다.
 * - 설정값(orientationLock)과 별도로 런타임 브리지도 호출 (옵션 C)
 * - 호스트가 아니면 no-op. 실패해도 게임 부트는 막지 않음.
 */
export async function lockLandscapeIfPossible(): Promise<void> {
  if (!isAppsInTossHost()) return;
  try {
    const { setDeviceOrientation } = await import('@apps-in-toss/web-framework');
    await setDeviceOrientation({ type: 'landscape' });
  } catch (e) {
    // 구버전 토스앱 / 브리지 미지원 — 가로 없이도 플레이는 가능해야 함
    console.warn('[ait] setDeviceOrientation(landscape) 실패', e);
  }
}
