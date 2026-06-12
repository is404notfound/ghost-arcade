import { describe, test, expect } from 'vitest';
import { Rng } from '../rng';

describe('Rng (mulberry32)', () => {
  test('같은 시드는 동일한 시퀀스를 생성한다', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  test('다른 시드는 다른 시퀀스를 생성한다', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  test('next()는 [0, 1) 범위의 값을 반환한다', () => {
    const rng = new Rng(987654321);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('nextInt(min, max)는 양 끝 포함 정수를 반환한다', () => {
    const rng = new Rng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(40, 90);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(40);
      expect(v).toBeLessThanOrEqual(90);
      seen.add(v);
    }
    // 충분히 돌리면 양 끝값도 나와야 한다 (편향 검출)
    expect(seen.has(40)).toBe(true);
    expect(seen.has(90)).toBe(true);
  });

  test('state를 읽고 복원하면 같은 지점부터 같은 시퀀스가 이어진다', () => {
    const a = new Rng(7);
    a.next();
    a.next();
    const saved = a.state;
    const after = [a.next(), a.next(), a.next()];

    const b = new Rng(0);
    b.state = saved;
    expect([b.next(), b.next(), b.next()]).toEqual(after);
  });
});
