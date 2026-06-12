import { describe, test, expect } from 'vitest';
import { ghostKey, saveIfBest, loadBest, type KVStore } from '../ghostStore';
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

describe('ghostStore — 그날 시드의 최고 기록만 보관', () => {
  test('키에 시뮬 버전과 시드가 들어간다', () => {
    expect(ghostKey(123)).toBe(`ga:ghost:v${SIM_VERSION}:123`);
  });

  test('첫 기록은 무조건 저장된다', () => {
    const store = memStore();
    const saved = saveIfBest(store, 7, makeLog(7, [10, 30]), 120);
    expect(saved).toBe(true);
    const best = loadBest(store, 7);
    expect(best).not.toBeNull();
    expect(best!.distance).toBe(120);
    expect(best!.log.events).toHaveLength(2);
  });

  test('더 짧은 거리는 기존 기록을 덮어쓰지 않는다', () => {
    const store = memStore();
    saveIfBest(store, 7, makeLog(7, [10]), 200);
    const saved = saveIfBest(store, 7, makeLog(7, [99]), 150);
    expect(saved).toBe(false);
    expect(loadBest(store, 7)!.distance).toBe(200);
  });

  test('더 긴 거리는 덮어쓴다', () => {
    const store = memStore();
    saveIfBest(store, 7, makeLog(7, [10]), 200);
    const saved = saveIfBest(store, 7, makeLog(7, [99]), 320);
    expect(saved).toBe(true);
    const best = loadBest(store, 7)!;
    expect(best.distance).toBe(320);
    expect(best.log.events[0]!.frame).toBe(99);
  });

  test('시드가 다르면 별개 슬롯이다 (어제 기록이 오늘 코스에 안 나옴)', () => {
    const store = memStore();
    saveIfBest(store, 7, makeLog(7, [10]), 200);
    expect(loadBest(store, 8)).toBeNull();
  });

  test('저장된 로그의 시드가 키와 어긋나면 무시한다', () => {
    const store = memStore();
    saveIfBest(store, 7, makeLog(7, [10]), 200);
    // 손상 시나리오: 7번 슬롯에 시드 9짜리 로그가 들어앉음
    // (로그는 중첩 직렬화돼 있어 내부 키가 \"seed\" 형태)
    const tampered = store.map.get(ghostKey(7))!.replace('\\"seed\\":7', '\\"seed\\":9');
    store.map.set(ghostKey(7), tampered);
    expect(loadBest(store, 7)).toBeNull();
  });

  test('버전이 다른 저장본은 무시한다 (밸런스 패치 후 고스트 어긋남 방지)', () => {
    const store = memStore();
    saveIfBest(store, 7, makeLog(7, [10]), 200);
    const tampered = store.map.get(ghostKey(7))!.replace(SIM_VERSION, '0.0.0-old');
    store.map.set(ghostKey(7), tampered);
    expect(loadBest(store, 7)).toBeNull();
  });

  test('손상된 JSON은 무시한다', () => {
    const store = memStore();
    store.map.set(ghostKey(7), '{broken');
    expect(loadBest(store, 7)).toBeNull();
  });

  test('storage가 예외를 던져도 (용량 초과 등) 게임은 죽지 않는다', () => {
    const store: KVStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveIfBest(store, 7, makeLog(7, [10]), 100)).not.toThrow();
    expect(loadBest(store, 7)).toBeNull();
  });
});
