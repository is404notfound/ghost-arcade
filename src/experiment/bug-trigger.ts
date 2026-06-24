import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  // 존재하지 않는 export에 강제로 접근하여 번들러가 void 0으로 치환하는 문제를 수정했습니다.
  // 대신 정상적으로 노출된 getWeightedScore 함수를 통해 보너스 스코어를 산출합니다.
  return mathUtils.getWeightedScore(0, combo);
}

export function buildScoreSummary(base: number, combo: number): ScoreSummary {
  const weighted = mathUtils.getWeightedScore(base, combo);
  return {
    base,
    bonus: weighted - base,
    total: weighted,
  };
}
