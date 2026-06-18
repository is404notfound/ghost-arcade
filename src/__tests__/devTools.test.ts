import { describe, test, expect } from 'vitest';
import { seedGhosts } from '../devTools';
import { loadTopRuns, GHOST_TOP_N, type KVStore } from '../ghostStore';

function memStore(): KVStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('seedGhosts — 헤드리스 봇 시딩 헬퍼', () => {
  test('seedGhosts 후 loadTopRuns는 기록을 반환한다', () => {
    const store = memStore();
    seedGhosts(store, 20260615);
    const runs = loadTopRuns(store, 20260615);
    expect(runs.length).toBeGreaterThan(0);
  });

  test('모든 기록의 시드는 주어진 시드와 일치한다', () => {
    const store = memStore();
    seedGhosts(store, 42);
    const runs = loadTopRuns(store, 42);
    for (const r of runs) {
      expect(r.log.seed).toBe(42);
    }
  });

  test('서로 다른 캐던스로 인해 여러 개의 기록이 생성된다', () => {
    const store = memStore();
    seedGhosts(store, 12345);
    const runs = loadTopRuns(store, 12345);
    const uniqueDists = new Set(runs.map((r) => r.distance));
    expect(uniqueDists.size).toBeGreaterThan(1);
  });

  test(`상위 ${GHOST_TOP_N}개 슬롯이 채워진다`, () => {
    const store = memStore();
    seedGhosts(store, 99);
    const runs = loadTopRuns(store, 99);
    expect(runs).toHaveLength(GHOST_TOP_N);
  });
});
