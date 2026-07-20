import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 WebView 래퍼 설정(= Granite config).
 * - appName / brand 값은 콘솔 등록 정보와 반드시 동일해야 함
 * - icon: 콘솔 앱 정보 업로드 URL (반영됨)
 * - webViewProps.type: 'game' → 게임 내비게이션/크롬
 * - webViewProps.orientationLock: 'landscape' → 가로 고정 (런타임 setDeviceOrientation과 병행)
 */
export default defineConfig({
  appName: 'ghost-runner',
  brand: {
    // 국문 브랜드명 — 내비/공유/브릿지 노출. 콘솔 앱 정보와 동일해야 함.
    displayName: '고스트대시',
    primaryColor: '#36f9f6',
    // 콘솔 앱 정보에서 업로드한 로고 URL (우클릭 → 링크 복사)
    icon: 'https://static.toss.im/appsintoss/59479/efc5594d-5313-4045-a6a2-f56f8ec2cc4b.png',
  },
  web: {
    // 실기기 Wi‑Fi: `ipconfig getifaddr en0` 결과를 host에 넣고 `npm run ait:sandbox`
    host: 'localhost',
    port: 5173,
    commands: {
      // 실기기 Wi‑Fi 테스트 시: host를 LAN IP로 바꾸고 dev를 `vite --host`로
      dev: 'vite --host',
      build: 'tsc --noEmit && vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
  // type: game → 게임 내비(닫기/더보기). 타이틀·아이콘은 게임 크롬에서 숨겨지고
  // brand.displayName/icon은 더보기·공유 등에서 사용됨.
  // orientationLock: SDK 2.10.5 공식 타입엔 없지만, 호스트가 읽으면 선제 가로 잠금.
  // 실질 보증은 main 부트의 setDeviceOrientation(landscape) — 옵션 C.
  webViewProps: {
    type: 'game',
    // @ts-expect-error SDK webViewProps 타입에 orientationLock 미정의 (커뮤니티/호스트 관례)
    orientationLock: 'landscape',
  },
  // 어두운 인게임 위에 투명 내비 — X/더보기만 남기고 콘텐츠가 풀스크린으로 이어짐
  navigationBar: {
    withBackButton: false,
    withHomeButton: false,
    withTitle: false,
    transparentBackground: true,
    theme: 'dark',
  },
});
