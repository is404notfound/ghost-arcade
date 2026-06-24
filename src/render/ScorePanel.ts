import * as mathUtils from '../utils/math';

export interface ScoreSummary {
  base: number;
  bonus: number;
  total: number;
}

export function refreshScore(combo: number): number {
  const calculateBonus = (mathUtils as Record<string, unknown>).calculateBonus as (
    n: number,
  ) => number;
  return calculateBonus(combo);
}

export function buildScoreSummary(base: number, combo: number): ScoreSummary {
  const weighted = mathUtils.getWeightedScore(base, combo);
  return {
    base,
    bonus: weighted - base,
    total: weighted,
  };
}
