// Sentry 초기화 — 반드시 앱의 가장 먼저 평가되는 모듈이어야 한다.
// main.ts의 첫 import로 두면 Phaser.Game 생성 등 어떤 런타임 코드보다 앞서
// 실행되어, 부트 단계 예외까지 전역 핸들러(onerror/onunhandledrejection)가 잡는다.
import * as Sentry from '@sentry/browser';
import { SIM_VERSION } from './sim/inputLog';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE, // 'development' | 'production'
  release: __APP_VERSION__, // vite define 주입값 — 소스맵 업로드 릴리스와 일치
  enabled: import.meta.env.PROD, // dev는 콘솔로 충분 + HMR 노이즈 차단
  tracesSampleRate: 0, // 우선 에러만 (성능 추적은 끔)
});

// 어떤 밸런스 버전에서 난 에러인지 = 리플레이/고스트 호환성 디버깅에 직결
Sentry.setTag('sim_version', SIM_VERSION);
