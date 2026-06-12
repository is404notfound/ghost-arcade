// 시드 고정 PRNG (mulberry32).
// D10: 비트 연산과 Math.imul만 사용 — 전부 32비트 정수 연산이라 JSC/V8 결과가 동일하다.
// Phase 0 학습: 테스터가 장애물 패턴을 외우려 함 → 시드 고정이 숙달 가능성과
// 고스트 공정성(같은 시드 = 같은 코스)을 둘 다 보장한다.
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) 균등 난수 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 양 끝 포함 정수 */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 내부 상태 — 시뮬 스냅샷/복원용 */
  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }
}
