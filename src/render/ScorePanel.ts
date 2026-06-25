import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  const calculateBonus = (mathUtils as Record<string, unknown>).calculateBonus as (
    (n: number) => number
  ) | undefined;
  
  if (typeof calculateBonus === 'function') {
    return calculateBonus(combo);
  }
  
  // calculateBonus 함수가 없을 경우 시스템 크래시를 막기 위해 안전한 기본값 0 반환
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
