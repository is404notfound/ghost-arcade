// PostHog 분석 계측 래퍼 (T6, person property/전송방식 확장은 T8).
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
 * track() 호출 단위 옵션.
 *
 * `instant: true` — game_over 전용. WebView가 이벤트 전송 직후 죽어도(unload) 유실되지
 * 않도록 PostHog SDK 기본 배칭 대신 `capture(event, props, { transport: 'sendBeacon' })`를
 * 쓴다. sendBeacon은 네이티브 unload-survival이 보장되고 메인스레드를 막지 않아, 게임오버
 * 연출 시점의 프레임드랍 우려(design doc Open Q5)도 함께 해소한다.
 *
 * 호출 예: track('game_over', props, { instant: true })
 */
export interface TrackOptions {
  instant?: boolean;
}

/**
 * 이벤트 계측 단일 진입점.
 * 키 미설정·SDK 에러·네트워크 차단 모두 조용히 무시한다.
 */
export function track(
  event: string,
  props: Record<string, unknown> = {},
  options?: TrackOptions,
): void {
  if (!_enabled) return;
  try {
    if (options?.instant) {
      posthog.capture(event, props, { transport: 'sendBeacon' });
    } else {
      posthog.capture(event, props);
    }
  } catch {
    // 계측 실패 ≠ 게임 크래시
  }
}

/**
 * Person property를 최초 1회만 설정($set_once 의미론). 이미 값이 있으면 덮어쓰지 않는다.
 * 용도 예: first_played_at.
 */
export function setPersonOnce(props: Record<string, unknown>): void {
  if (!_enabled) return;
  try {
    posthog.setPersonProperties(undefined, props);
  } catch {
    // 계측 실패 ≠ 게임 크래시
  }
}

/**
 * Person property를 현재값으로 갱신($set 의미론).
 * 용도 예: lifetime_runs, lifetime_max_distance, platform.
 */
export function setPerson(props: Record<string, unknown>): void {
  if (!_enabled) return;
  try {
    posthog.setPersonProperties(props);
  } catch {
    // 계측 실패 ≠ 게임 크래시
  }
}

/**
 * 실행 플랫폼 판별. 토스 미니앱 진입 시그널이 없으면 'vercel'을 기본값으로 반환한다.
 *
 * 판별 시그널: 저장소에 아직 토스 미니앱 SDK 연동이 없어(package.json 확인 완료),
 * 설계 문서(Person Properties 절)가 명시한 플레이스홀더 시그널 — 진입 URL의 `toss` 쿼리
 * 파라미터 존재 여부를 사용한다. 실제 토스 SDK 통합 시 `window` 전역 체크로 교체 예정
 * (Forward-design 슬롯, design doc 참조).
 */
export function detectPlatform(): 'vercel' | 'toss' {
  try {
    if (
      typeof location !== 'undefined' &&
      new URLSearchParams(location.search).get('toss') != null
    ) {
      return 'toss';
    }
  } catch {
    // 판별 실패 — 기본값(vercel)으로 진행
  }
  return 'vercel';
}
