import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 WebView 래퍼 설정 (SDK 3.x).
 * - brand.displayName/icon 은 콘솔 앱 정보에서 관리 (3.x에서 설정 파일 제거)
 * - webView.type 삭제 — 게임 크롬은 콘솔/호스트 관례 + navigationBar 로 유지
 * - 가로 잠금 실질 보증은 main 부트의 setDeviceOrientation(landscape)
 */
export default defineConfig({
  appName: 'ghost-runner',
  brand: {
    primaryColor: '#36f9f6',
  },
  permissions: [],
  webBundleDir: 'dist',
  webView: {},
  // 어두운 인게임 위에 투명 내비 — X/더보기만 남기고 콘텐츠가 풀스크린으로 이어짐
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'dark',
  },
});
