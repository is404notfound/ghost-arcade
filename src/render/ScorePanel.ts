import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  const calculateBonus = (mathUtils as Record<string, unknown>).calculateBonus;
  
  // calculateBonus가 실제로 함수인지 확인하여 런타임 에러 방지
  if (typeof calculateBonus === 'function') {
    return (calculateBonus as (n: number) => number)(combo);
  }
  
  // 함수가 존재하지 않을 경우 안전한 기본값 반환
  return 0;
}

export function buildScoreSummary(base: number, combo: number): ScoreSummary {
  const weighted = mathUtils.getWeightedScore(base, combo);
  return {
    base,
    bonus: weighted - base,
    total: weighted,
  };
}
