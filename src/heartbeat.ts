// 비정상 종료(웹뷰 OOM·프로세스 킬) 탐지 — 플레이북 §1 abnormal_exit 지표.
//
// 저사양 기기에서 웹뷰가 OOM으로 죽는 건 JS 예외가 아니라 Sentry에 잡히지 않는다.
// 원리: 부트 시 하트비트 플래그를 기록하고 주기 갱신, 정상 종료 경로(pagehide)에서
// 해제한다. 다음 부트에 플래그가 남아 있으면 = 직전 세션이 종료 신호 없이 죽었다는 뜻.
//
// 광고 표시 중 pagehide가 오면 HB_KEY를 지우면 OOM 탐지가 깨지고, 안 지우면 30초 정지로
// 오탐한다 → pauseHeartbeatDuringAd / resumeHeartbeatAfterAd 로 명시 일시정지.
import { track } from './analytics';
import { mirrorEvent } from './eventMirror';
import { getUserId } from './identity';

const HB_KEY = 'ga:hb';
const HB_INTERVAL_MS = 5000;

let intervalId: number | null = null;
let pausedForAd = false;
let pagehideHandler: (() => void) | null = null;

function beat(): void {
  try {
    window.localStorage.setItem(HB_KEY, String(Date.now()));
  } catch {
    /* 스토리지 차단 — 무시 */
  }
}

export function initHeartbeat(): void {
  try {
    const prev = window.localStorage.getItem(HB_KEY);
    if (prev) {
      const msSinceLastBeat = Date.now() - (parseInt(prev, 10) || 0);
      const userId = getUserId(window.localStorage);
      track('abnormal_exit', { ms_since_last_beat: msSinceLastBeat });
      mirrorEvent('abnormal_exit', userId, { ms_since_last_beat: msSinceLastBeat });
    }

    beat();
    intervalId = window.setInterval(beat, HB_INTERVAL_MS);

    pagehideHandler = () => {
      if (pausedForAd) return; // 광고 중 pagehide는 정상 종료로 취급하지 않음
      try {
        window.localStorage.removeItem(HB_KEY);
      } catch {
        /* 무시 */
      }
    };
    window.addEventListener('pagehide', pagehideHandler);
    window.addEventListener('pageshow', beat);
  } catch {
    /* localStorage 차단 환경 — 탐지 불가, 조용히 무시 */
  }
}

/** 광고 시작 — pagehide가 HB를 지우지 않게 하고 비트만 유지 */
export function pauseHeartbeatDuringAd(): void {
  pausedForAd = true;
  beat();
}

/** 광고 종료 — 정상 종료 경로 복구 */
export function resumeHeartbeatAfterAd(): void {
  pausedForAd = false;
  beat();
}

/** 테스트 전용 */
export function __resetHeartbeatForTest(): void {
  pausedForAd = false;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
