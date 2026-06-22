// PostHog 분석 계측 래퍼 (T6).
//
// 설계 원칙:
//   - VITE_POSTHOG_KEY 없으면 전체 no-op (로컬/테스트 환경 기본값)
//   - 모든 track() 호출은 try/catch — 계측 실패 ≠ 게임 크래시
//   - 오프라인 버퍼링은 PostHog SDK 기본 기능(localStorage 큐잉)으로 처리
//   - 개인식별정보 없음 — PostHog 익명 ID만 사용
//   - 자동 캡처(클릭/페이지뷰) 비활성화 — 게임 이벤트만 수동 계측
import posthog from 'posthog-js';

let _enabled = false;

/** main.ts에서 Phaser 생성 전에 1회 호출 */
export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return; // 키 없으면 no-op
  const host =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
    'https://us.i.posthog.com';
  try {
    posthog.init(key, {
      api_host: host,
      autocapture: false,       // 게임 이벤트만 수동 수집
      capture_pageview: false,  // SPA, 페이지뷰 불필요
      persistence: 'localStorage', // 오프라인 시 이벤트 큐잉 → 복귀 시 플러시
    });
    _enabled = true;
  } catch {
    // PostHog 초기화 실패 — 계측 없이 정상 진행
  }
}

/**
 * 이벤트 계측 단일 진입점.
 * 키 미설정·SDK 에러·네트워크 차단 모두 조용히 무시한다.
 */
export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!_enabled) return;
  try {
    posthog.capture(event, props);
  } catch {
    // 계측 실패 ≠ 게임 크래시
  }
}
