import { describe, it, expect } from 'vitest';
import { getUserId, getNickname, setNickname } from '../identity';
import type { KVStore } from '../ghostStore';

function makeKv(): KVStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

const throwingKv: KVStore = {
  getItem: () => {
    throw new Error('storage blocked');
  },
  setItem: () => {
    throw new Error('storage blocked');
  },
};

describe('getUserId', () => {
  it('최초 호출 시 UUID 생성·저장, 이후 동일 값 반환', () => {
    const kv = makeKv();
    const first = getUserId(kv);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(getUserId(kv)).toBe(first);
    expect(kv.map.get('ga:user-id')).toBe(first);
  });

  it('스토리지 차단: 세션 내 일관된 폴백 ID', () => {
    expect(getUserId(throwingKv)).toBe(getUserId(throwingKv));
  });
});

describe('getNickname', () => {
  it('최초 호출 시 랜덤 닉네임 생성·저장 (형식: 이름-두자리숫자)', () => {
    const kv = makeKv();
    const nick = getNickname(kv);
    expect(nick).toMatch(/^.+-\d{2}$/);
    expect(getNickname(kv)).toBe(nick);
  });

  it('스토리지 차단: 세션 내 일관된 폴백 닉네임', () => {
    expect(getNickname(throwingKv)).toBe(getNickname(throwingKv));
  });
});

describe('setNickname', () => {
  it('수동 설정 후 getNickname이 새 값 반환, 12자 초과는 잘림', () => {
    const kv = makeKv();
    setNickname(kv, '  질주하는고양이인데매우길다  ');
    expect(getNickname(kv)).toBe('질주하는고양이인데매우길'); // 12자에서 잘림
    expect(getNickname(kv).length).toBeLessThanOrEqual(12);
  });

  it('빈 문자열/공백은 무시 — 기존 닉네임 유지', () => {
    const kv = makeKv();
    const original = getNickname(kv);
    setNickname(kv, '   ');
    expect(getNickname(kv)).toBe(original);
  });
});

describe('deterministicNickname', () => {
  it('같은 키는 항상 같은 닉네임, 형식 유지', async () => {
    const { deterministicNickname } = await import('../identity');
    const a = deterministicNickname(3061741561);
    expect(deterministicNickname(3061741561)).toBe(a);
    expect(a).toMatch(/^.+-\d{2}$/);
    // 다른 키는 (대체로) 다른 이름 — 최소한 항상 같지는 않아야 한다
    const names = new Set([0, 1, 2, 3, 4].map((k) => deterministicNickname(k)));
    expect(names.size).toBeGreaterThan(1);
  });
});
