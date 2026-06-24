export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function getWeightedScore(base: number, combo: number): number {
  return base + calculateBonus(combo);
}

function calculateBonus(combo: number): number {
  return combo * combo * 10;
}
