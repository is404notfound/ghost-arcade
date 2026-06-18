import { describe, test, expect } from 'vitest';
import { ghostKey, saveRun, loadTopRuns, GHOST_TOP_N, type KVStore } from '../ghostStore';
import { createInputLog, recordTap, SIM_VERSION } from '../sim/inputLog';

function memStore(): KVStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

function makeLog(seed: number, taps: number[]) {
  const log = createInputLog(seed);
  for (const f of taps) recordTap(log, f);
  return log;
}

describe('ghostStore — 그날 시드의 상위 N개 기록 보관', () => {
  test('키에 시뮬 버전과 시드가 들어간다', () => {
    expect(ghostKey(123)).toBe(`ga:ghost:v${SIM_VERSION}:123`);
  });

  test('첫 기록은 저장되고 목록에 나온다', () => {
    const store = memStore();
    expect(saveRun(store, 7, makeLog(7, [10]), 120)).toBe(true);
    const runs = loadTopRuns(store, 7);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.distance).toBe(120);
  });

  test('기록들은 거리 내림차순으로 정렬된다', () => {
    const store = memStore();
    saveRun(store, 7, makeLog(7, [1]), 100);
    saveRun(store, 7, makeLog(7, [2]), 300);
    saveRun(store, 7, makeLog(7, [3]), 200);
    expect(loadTopRuns(store, 7).map((r) => r.distance)).toEqual([300, 200, 100]);
  });

  test('상위 N개만 보관하고 최하위가 탈락한다', () => {
    const store = memStore();
    for (let i = 1; i <= GHOST_TOP_N + 2; i++) {
      saveRun(store, 7, makeLog(7, [i]), i * 100); // 100..700
    }
    const runs = loadTopRuns(store, 7);
    expect(runs).toHaveLength(GHOST_TOP_N);
    expect(runs[0]!.distance).toBe((GHOST_TOP_N + 2) * 100); // 최고 유지
    expect(runs[runs.length - 1]!.distance).toBe(300); // 100, 200 탈락
  });

  test('top-N 미달 기록은 저장되지 않고 false', () => {
    const store = memStore();
    for (let i = 1; i <= GHOST_TOP_N; i++) {
      saveRun(store, 7, makeLog(7, [i]), 1000 + i);
    }
    expect(saveRun(store, 7, makeLog(7, [99]), 50)).toBe(false);
    expect(loadTopRuns(store, 7)).toHaveLength(GHOST_TOP_N);
    expect(loadTopRuns(store, 7).every((r) => r.distance >= 1000)).toBe(true);
  });

  test('시드가 다르면 별개 슬롯이다', () => {
    const store = memStore();
    saveRun(store, 7, makeLog(7, [10]), 200);
    expect(loadTopRuns(store, 8)).toEqual([]);
  });

  test('손상된 레코드는 개별 필터링되고 나머지는 살아남는다', () => {
    const store = memStore();
    saveRun(store, 7, makeLog(7, [10]), 200);
    saveRun(store, 7, makeLog(7, [20]), 300);
    // 한 레코드의 내부 로그 시드만 변조 (중첩 직렬화라 \"seed\" 형태)
    const tampered = store.map.get(ghostKey(7))!.replace('\\"seed\\":7', '\\"seed\\":9');
    store.map.set(ghostKey(7), tampered);
    const runs = loadTopRuns(store, 7);
    expect(runs).toHaveLength(1); // 변조된 1건만 빠짐
  });

  test('버전이 다른 저장본은 무시한다', () => {
    const store = memStore();
    saveRun(store, 7, makeLog(7, [10]), 200);
    const tampered = store.map.get(ghostKey(7))!.replaceAll(SIM_VERSION, '0.0.0-old');
    store.map.set(ghostKey(7), tampered);
    expect(loadTopRuns(store, 7)).toEqual([]);
  });

  test('손상된 JSON은 빈 목록으로 처리한다', () => {
    const store = memStore();
    store.map.set(ghostKey(7), '{broken');
    expect(loadTopRuns(store, 7)).toEqual([]);
  });

  test('storage가 예외를 던져도 게임은 죽지 않는다', () => {
    const store: KVStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveRun(store, 7, makeLog(7, [10]), 100)).not.toThrow();
    expect(loadTopRuns(store, 7)).toEqual([]);
  });
});
