// 검증 전용 — Sentry(및 Seer Autofix) 테스트를 위한 다양한 타입의 의도적 에러 모음.
//   ?error=<key>  하나만 발생          (예: ?error=type)
//   ?error=all    10종을 한 번에 발생
//   ?boom         generic 별칭(기존 호환)
//
// 각 에러는 고유한 타입 + 고유한 함수(스택 프레임)를 갖게 해서 Sentry에서 별도 이슈로
// 그룹화되도록 했다. all 모드는 동기 throw가 서로를 중단시키지 않도록 각각을 독립된
// setTimeout으로 던진다 — 한 번의 페이지 로드로 10개가 모두 보고된다.
import * as Sentry from '@sentry/browser';

/** 고스트 리플레이 디코딩 실패를 흉내 낸 도메인 커스텀 에러 */
export class GhostReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhostReplayError';
  }
}

function throwGeneric(): void {
  throw new Error('[test] generic Error — 일반 에러');
}

function throwTypeError(): void {
  // 실제 TypeError: Cannot read properties of undefined (reading 'play')
  const ghost = undefined as unknown as { play(): void };
  ghost.play();
}

function throwRangeError(): void {
  // 실제 RangeError: toFixed() digits argument must be between 0 and 100
  console.log((1).toFixed(500));
}

function throwReferenceError(): void {
  throw new ReferenceError('[test] 정의되지 않은 변수 접근 시뮬레이션');
}

function throwSyntaxError(): void {
  // 손상된 고스트 레코드 파싱을 흉내 → 실제 SyntaxError
  JSON.parse('{ "distance": , }');
}

function throwUriError(): void {
  // 실제 URIError: URI malformed
  decodeURIComponent('%');
}

function throwCustomError(): void {
  throw new GhostReplayError('[test] 고스트 리플레이 디코딩 실패');
}

function triggerUnhandledRejection(): void {
  // 처리되지 않은 Promise 거부 → window.onunhandledrejection 경로
  void Promise.reject(new Error('[test] 처리되지 않은 Promise 거부'));
}

function triggerAsyncError(): void {
  // 타이머 콜백에서 발생하는 비동기 에러가 전역으로 퍼지지 않도록 try-catch 적용
  setTimeout(() => {
    try {
      throw new Error('[test] 비동기 타이머 에러');
    } catch (error) {
      // 에러가 브라우저를 크래시시키지 않도록 안전하게 잡은 뒤 Sentry로 보고
      Sentry.captureException(error);
      console.warn('[test] 비동기 에러가 안전하게 처리되었습니다.', error);
    }
  }, 0);
}

function triggerManualCapture(): void {
  // 던지지 않고 직접 보고 — 컨텍스트/태그를 붙인 warning 레벨 이벤트
  Sentry.captureException(new Error('[test] 수동 캡처 (warning + 컨텍스트)'), {
    level: 'warning',
    tags: { test_kind: 'manual' },
    extra: { note: 'Sentry.captureException 직접 호출 경로' },
  });
}

const TRIGGERS: Record<string, () => void> = {
  generic: throwGeneric,
  type: throwTypeError,
  range: throwRangeError,
  reference: throwReferenceError,
  syntax: throwSyntaxError,
  uri: throwUriError,
  custom: throwCustomError,
  promise: triggerUnhandledRejection,
  async: triggerAsyncError,
  manual: triggerManualCapture,
};

export const TEST_ERROR_KEYS = Object.keys(TRIGGERS);

/**
 * ?error=<key> 처리. 'all'이면 10종을 각각 독립 setTimeout으로 발생시킨다.
 * 단일 키의 동기 throw는 모듈 평가를 중단시키므로(=게임 미로딩) 한 판에 하나만.
 */
export function runTestError(key: string): void {
  if (key === 'all') {
    for (const name of TEST_ERROR_KEYS) {
      setTimeout(() => TRIGGERS[name]!(), 0);
    }
    console.log(`[test] ${TEST_ERROR_KEYS.length}종 에러 발생 — Sentry Issues 확인`);
    return;
  }
  const trigger = TRIGGERS[key];
  if (trigger === undefined) {
    console.warn(`[test] 알 수 없는 error key: "${key}". 가능: ${TEST_ERROR_KEYS.join(', ')}, all`);
    return;
  }
  trigger();
}
