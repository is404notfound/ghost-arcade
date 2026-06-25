import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  // 존재하지 않는 calculateBonus 함수를 강제 타입 캐스팅하여 호출하는 안티패턴 제거
  // 대신 모듈에 존재하는 getWeightedScore 함수를 사용하여 기본 점수 0 기준의 콤보 가중 점수를 반환
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

