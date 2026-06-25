import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  const mathUtilsRecord = mathUtils as Record<string, unknown>;
  
  if (typeof mathUtilsRecord.calculateBonus === 'function') {
    const calculateBonus = mathUtilsRecord.calculateBonus as (n: number) => number;
    return calculateBonus(combo);
  }
  
  // 함수가 존재하지 않을 때 애플리케이션 크래시를 방지하기 위해 안전한 기본값 반환
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
