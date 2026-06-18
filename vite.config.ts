/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  // 압축된 스택트레이스를 원본 src/ 위치로 되돌리려면 소스맵이 필수
  build: { sourcemap: true },
  // init의 release와 동일한 값 — 소스맵과 에러를 같은 릴리스로 묶는다
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) },
  plugins: [
    // SENTRY_AUTH_TOKEN이 있을 때만 업로드 동작 (없으면 빌드는 통과, 업로드만 skip)
    sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? 'marblex-rg',
      project: process.env.SENTRY_PROJECT ?? 'seer-test',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // 업로드 후 .map을 산출물에서 제거 → 공개 배포에 소스맵 노출 방지.
      // (업로드가 실제로 일어날 때만 삭제됨 = authToken 있을 때만)
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    }),
  ],
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node', // 시뮬 코어는 DOM 의존 0 — node 환경으로 충분
  },
});
