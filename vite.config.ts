/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// 프로덕션 빌드에 반드시 번들돼야 하는 클라이언트 환경변수 (VITE_ 접두사 필수).
// 이게 빠진 채 .ait가 배포되면 계측(PostHog)·백엔드(Supabase)가 통째로 죽는다 —
// 2026-07-21 프로덕션 사고의 원인. 빌드 시점에 큰 소리로 실패시켜 재발을 막는다.
// 정말 없이 빌드해야 하는 예외 상황엔 SKIP_ENV_CHECK=1 로 우회.
const REQUIRED_CLIENT_ENV = [
  'VITE_POSTHOG_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

export default defineConfig(({ command, mode }) => {
  // build일 때만 검사 — dev(serve)는 폴백 no-op으로 로컬 개발 가능해야 하고, test는 빌드 안 함.
  if (command === 'build' && process.env.SKIP_ENV_CHECK !== '1') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const missing = REQUIRED_CLIENT_ENV.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `\n[env-guard] 프로덕션 빌드에 필수 환경변수가 없습니다: ${missing.join(', ')}\n` +
          `→ .env.local(또는 CI 환경변수)에 VITE_ 접두사로 설정하세요.\n` +
          `  이대로 빌드하면 계측·백엔드가 빠진 .ait가 배포됩니다 (2026-07-21 사고).\n` +
          `  의도적으로 없이 빌드하려면 SKIP_ENV_CHECK=1 로 실행하세요.\n`,
      );
    }
    // Sentry DSN은 선택 — 없으면 에러 리포팅만 꺼지므로 경고만.
    if (!env.VITE_SENTRY_DSN) {
      console.warn('[env-guard] VITE_SENTRY_DSN 미설정 — 에러 리포팅 없이 빌드합니다.');
    }
  }

  return {
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
        // 소스맵 업로드/릴리스 생성 실패가 배포 빌드를 깨뜨리지 않도록(기본은 throw=빌드 중단).
        // 토큰 누락/오류는 경고만 남기고 빌드는 계속 — 배포가 Sentry 부가작업 때문에 막히면 안 됨.
        errorHandler: (err) => {
          console.warn('[sentry-vite-plugin] 비치명적 오류 — 빌드 계속:', err.message);
        },
      }),
    ],
    test: {
      include: ['src/**/__tests__/**/*.test.ts'],
      environment: 'node', // 시뮬 코어는 DOM 의존 0 — node 환경으로 충분
    },
  };
});
