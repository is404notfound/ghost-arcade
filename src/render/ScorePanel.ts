import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  // 존재하지 않는 calculateBonus의 강제 형변환 호출을 제거하고,
  // 안전하게 getWeightedScore를 활용해 기본 점수 0 기준의 콤보 보너스를 계산합니다.
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
