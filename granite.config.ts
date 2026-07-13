import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스 WebView 래퍼 설정(= Granite config).
 * - appName / brand 값은 콘솔 등록 정보와 반드시 동일해야 함
 * - icon: 콘솔 앱 정보 업로드 URL (반영됨)
 * - webViewProps.type: 'game' → 게임 내비게이션/크롬
 */
export default defineConfig({
  appName: 'ghost-runner',
  brand: {
    displayName: 'Ghost Runner', // 콘솔 표시 이름과 다르면 콘솔 값으로 맞출 것
    primaryColor: '#36f9f6',
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
  webViewProps: { type: 'game' },
});
