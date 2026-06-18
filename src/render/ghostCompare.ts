// 게임오버 시 고스트 경쟁 결과 계산 — 렌더 전용 순수 로직 (sim 변경 없음).
// 비교 기준은 '판 시작 시점에 로드된 고스트 기록들'이다 — 이번 판을 저장하기
// 전에 계산해야 내 기록이 비교 대상에 섞이지 않는다.

/** 이 미터 이내로 졌으면 "박빙" — 재시도 유도 구간 */
export const CLOSE_MARGIN_M = 30;

export interface GhostComparison {
  hasGhosts: boolean;
  bestGhostDist: number;
  /** 차이(정수 미터, 항상 양수 표시용). 신기록이면 앞선 거리, 졌으면 뒤진 거리 */
  diffM: number;
  overtaken: number;
  total: number;
  isRecord: boolean;
  isClose: boolean;
}

export interface LivePace {
  /** 최고 고스트 최종 기록을 이미 넘어섰는가 (신기록 페이스) */
  ahead: boolean;
  /** 차이(정수 미터, 항상 양수 표시용) */
  diffM: number;
}

/** 플레이 중 매 프레임 호출되는 페이스 계산 — 할당 없는 단순 산술 */
export function livePace(myDist: number, bestGhostDist: number): LivePace {
  const ahead = myDist > bestGhostDist;
  return { ahead, diffM: Math.floor(Math.abs(myDist - bestGhostDist)) };
}

export function compareGhosts(myDist: number, ghostDistances: number[]): GhostComparison {
  if (ghostDistances.length === 0) {
    return {
      hasGhosts: false,
      bestGhostDist: 0,
      diffM: 0,
      overtaken: 0,
      total: 0,
      isRecord: false,
      isClose: false,
    };
  }

  let best = 0;
  let overtaken = 0;
  for (const d of ghostDistances) {
    if (d > best) best = d;
    if (d < myDist) overtaken++;
  }

  const isRecord = myDist > best;
  return {
    hasGhosts: true,
    bestGhostDist: best,
    diffM: Math.floor(Math.abs(myDist - best)),
    overtaken,
    total: ghostDistances.length,
    isRecord,
    isClose: !isRecord && best - myDist <= CLOSE_MARGIN_M,
  };
}
