import { describe, expect, it } from 'vitest';
import {
  normalizeInterstitialPeriod,
  shouldShowInterstitial,
  utcDateKey,
} from '../interstitialGate';

describe('normalizeInterstitialPeriod', () => {
  it('0 / 0.5 / -1 / NaN / 999 정규화', () => {
    expect(normalizeInterstitialPeriod(0)).toBe(1);
    expect(normalizeInterstitialPeriod(0.5)).toBe(1);
    expect(normalizeInterstitialPeriod(-1)).toBe(1);
    expect(normalizeInterstitialPeriod(Number.NaN)).toBe(5);
    expect(normalizeInterstitialPeriod(999)).toBe(50);
    expect(normalizeInterstitialPeriod(5)).toBe(5);
  });
});

describe('shouldShowInterstitial', () => {
  const day = new Date('2026-08-07T12:00:00Z');
  const base = {
    enabled: true,
    skippedBecauseReviveAd: false,
    period: 5,
    lifetimeRunIndex: 5,
    minLifetimeRunIndex: 5,
    now: day,
  };

  it('count % period === 0 이면 show', () => {
    const r = shouldShowInterstitial({
      ...base,
      stored: { date: utcDateKey(day), count: 4 },
    });
    expect(r.show).toBe(true);
    expect(r.next.count).toBe(5);
  });

  it('lifetime_run_index < min 이면 skip (count는 +1)', () => {
    const r = shouldShowInterstitial({
      ...base,
      lifetimeRunIndex: 4,
      stored: { date: utcDateKey(day), count: 4 },
    });
    expect(r.show).toBe(false);
    expect(r.next.count).toBe(5);
  });

  it('UTC 날짜 경계에서 리셋', () => {
    const nextDay = new Date('2026-08-08T00:00:01Z');
    const r = shouldShowInterstitial({
      ...base,
      now: nextDay,
      stored: { date: '2026-08-07', count: 99 },
    });
    expect(r.next.date).toBe('2026-08-08');
    expect(r.next.count).toBe(1);
    expect(r.show).toBe(false);
  });

  it('이어뛰기 시청 직후 skip + count++', () => {
    const r = shouldShowInterstitial({
      ...base,
      skippedBecauseReviveAd: true,
      stored: { date: utcDateKey(day), count: 4 },
    });
    expect(r.show).toBe(false);
    expect(r.next.count).toBe(5);
  });

  it('플래그 false면 항상 skip', () => {
    const r = shouldShowInterstitial({
      ...base,
      enabled: false,
      period: 1,
      stored: { date: utcDateKey(day), count: 0 },
    });
    expect(r.show).toBe(false);
    expect(r.next.count).toBe(1);
  });

  it('stored null(손상)이면 기본값부터', () => {
    const r = shouldShowInterstitial({
      ...base,
      stored: null,
    });
    expect(r.next.count).toBe(1);
    expect(r.show).toBe(false);
  });
});
