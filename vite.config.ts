/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';

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
  }

  return {
    test: {
      include: ['src/**/__tests__/**/*.test.ts'],
      environment: 'node', // 시뮬 코어는 DOM 의존 0 — node 환경으로 충분
    },
  };
});
