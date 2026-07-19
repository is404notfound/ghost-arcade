// 비정상 종료(웹뷰 OOM·프로세스 킬) 탐지 — 플레이북 §1 abnormal_exit 지표.
//
// 저사양 기기에서 웹뷰가 OOM으로 죽는 건 JS 예외가 아니라 Sentry에 잡히지 않는다.
// 원리: 부트 시 하트비트 플래그를 기록하고 주기 갱신, 정상 종료 경로(pagehide)에서
// 해제한다. 다음 부트에 플래그가 남아 있으면 = 직전 세션이 종료 신호 없이 죽었다는 뜻.
//
// 한계(플레이북에 명기): pagehide가 안 오는 정상 종료 케이스도 있어 절대값이 아니라
// **추세 프록시**로만 쓴다. 급증 = 저사양 크래시 또는 특정 버전 회귀 신호.
import { track } from './analytics';
import { mirrorEvent } from './eventMirror';
import { getUserId } from './identity';

const HB_KEY = 'ga:hb';
const HB_INTERVAL_MS = 5000;

export function initHeartbeat(): void {
  try {
    const prev = window.localStorage.getItem(HB_KEY);
    if (prev) {
      // 직전 세션이 pagehide 없이 종료됨 — 마지막 하트비트로부터의 경과가 사망 추정 시각
      const msSinceLastBeat = Date.now() - (parseInt(prev, 10) || 0);
      const userId = getUserId(window.localStorage);
      track('abnormal_exit', { ms_since_last_beat: msSinceLastBeat });
      mirrorEvent('abnormal_exit', userId, { ms_since_last_beat: msSinceLastBeat });
    }

    const beat = () => {
      try {
        window.localStorage.setItem(HB_KEY, String(Date.now()));
      } catch {
        /* 스토리지 차단 — 무시 */
      }
    };
    beat();
    window.setInterval(beat, HB_INTERVAL_MS);

    // 정상 종료 — pagehide가 모바일 웹뷰에서 가장 신뢰도 높은 종료 신호
    window.addEventListener('pagehide', () => {
      try {
        window.localStorage.removeItem(HB_KEY);
      } catch {
        /* 무시 */
      }
    });
    // bfcache 복귀 — pagehide로 지웠던 플래그 재설정
    window.addEventListener('pageshow', beat);
  } catch {
    /* localStorage 차단 환경 — 탐지 불가, 조용히 무시 */
  }
}
