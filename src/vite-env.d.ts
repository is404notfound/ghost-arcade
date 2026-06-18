/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// vite.config.ts의 define으로 빌드 시 주입된다 (package.json version).
declare const __APP_VERSION__: string;
