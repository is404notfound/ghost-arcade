import { describe, test, expect } from 'vitest';
import { dailySeed } from '../dailySeed';

describe('dailySeed — 오늘의 코스 시드', () => {
  test('같은 UTC 날짜면 시각이 달라도 같은 시드', () => {
    const morning = new Date(Date.UTC(2026, 5, 12, 0, 1, 0));
    const night = new Date(Date.UTC(2026, 5, 12, 23, 59, 59));
    expect(dailySeed(morning)).toBe(dailySeed(night));
  });

  test('UTC 날짜가 바뀌면 시드도 바뀐다', () => {
    const today = new Date(Date.UTC(2026, 5, 12, 23, 59, 59));
    const tomorrow = new Date(Date.UTC(2026, 5, 13, 0, 0, 1));
    expect(dailySeed(today)).not.toBe(dailySeed(tomorrow));
  });

  test('로컬 타임존이 아니라 UTC 기준이다', () => {
    // UTC 6/12 15:00 = KST 6/13 00:00 — KST로는 날이 바뀌었지만 UTC로는 같은 날
    const utcAfternoon = new Date(Date.UTC(2026, 5, 12, 15, 0, 0));
    const utcMorning = new Date(Date.UTC(2026, 5, 12, 1, 0, 0));
    expect(dailySeed(utcAfternoon)).toBe(dailySeed(utcMorning));
  });

  test('시드는 32비트 무부호 정수다 (GameSim/로그에 그대로 사용 가능)', () => {
    const s = dailySeed(new Date(Date.UTC(2026, 5, 12)));
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });

  test('연속된 날들이 서로 다른 시드를 낸다 (단순 증가 아님 — 코스 다양성)', () => {
    const seeds = new Set<number>();
    for (let d = 1; d <= 28; d++) {
      seeds.add(dailySeed(new Date(Date.UTC(2026, 5, d))));
    }
    expect(seeds.size).toBe(28);
  });
});
