import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  const utils = mathUtils as Record<string, unknown>;
  
  // calculateBonus가 실제로 존재하는 함수인지 런타임에 확인하여 안전하게 호출합니다.
  if (typeof utils.calculateBonus === 'function') {
    const calculateBonus = utils.calculateBonus as (n: number) => number;
    return calculateBonus(combo);
  }
  
  // 함수가 존재하지 않을 경우 크래시를 방지하기 위해 안전한 기본값을 반환합니다.
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

