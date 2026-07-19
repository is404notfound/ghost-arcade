import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
}));

async function getModule() {
  const mod = await import('../remoteConfig');
  return mod;
}

async function getClientMock() {
  const { getSupabaseClient } = await import('../supabaseClient');
  return vi.mocked(getSupabaseClient);
}

function makeChain(result: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue(result),
  };
  return { client: { from: vi.fn().mockReturnValue(chain) }, chain };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('remoteConfig', () => {
  it('Supabase 미설정: 코드 기본값', async () => {
    const getClient = await getClientMock();
    getClient.mockReturnValue(null);
    const { loadRemoteConfig, remoteConfig } = await getModule();

    await loadRemoteConfig();
    expect(remoteConfig('blackout_enabled')).toBe(true);
    expect(remoteConfig('blackout_edge_ratio')).toBe(0.7);
  });

  it('원격 값이 있으면 override (타입 일치 시)', async () => {
    const getClient = await getClientMock();
    const { client } = makeChain({
      data: [
        { key: 'blackout_enabled', value: false },
        { key: 'blackout_edge_ratio', value: 0.85 },
        { key: 'unknown_key', value: 'x' }, // 모르는 키는 무시
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadRemoteConfig, remoteConfig } = await getModule();

    await loadRemoteConfig();
    expect(remoteConfig('blackout_enabled')).toBe(false);
    expect(remoteConfig('blackout_edge_ratio')).toBe(0.85);
    expect(remoteConfig('bot_upload_enabled')).toBe(true); // 미지정 키는 기본값
  });

  it('타입 불일치 원격 값은 무시하고 기본값', async () => {
    const getClient = await getClientMock();
    const { client } = makeChain({
      data: [
        { key: 'blackout_enabled', value: 'off' }, // boolean이어야 함
        { key: 'blackout_edge_ratio', value: '0.5' }, // number여야 함
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadRemoteConfig, remoteConfig } = await getModule();

    await loadRemoteConfig();
    expect(remoteConfig('blackout_enabled')).toBe(true);
    expect(remoteConfig('blackout_edge_ratio')).toBe(0.7);
  });

  it('테이블 미적용(에러): 기본값 유지, 예외 미전파', async () => {
    const getClient = await getClientMock();
    const { client } = makeChain({
      data: null,
      error: { code: '42P01', message: 'relation "remote_config" does not exist' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadRemoteConfig, remoteConfig } = await getModule();

    await expect(loadRemoteConfig()).resolves.toBeUndefined();
    expect(remoteConfig('blackout_enabled')).toBe(true);
  });
});

describe('eventMirror', () => {
  it('insert 호출 (event/user_id/props), 실패해도 예외 미전파', async () => {
    const getClient = await getClientMock();
    const insert = vi.fn().mockResolvedValue({ error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) } as any);
    const { mirrorEvent } = await import('../eventMirror');

    mirrorEvent('game_start', 'uid-1', { seed: 123 });
    expect(insert).toHaveBeenCalledWith({
      event: 'game_start',
      user_id: 'uid-1',
      props: { seed: 123 },
    });

    // 실패 케이스 — reject여도 조용히 무시
    insert.mockRejectedValueOnce(new Error('down'));
    expect(() => mirrorEvent('abnormal_exit')).not.toThrow();
  });

  it('Supabase 미설정: no-op', async () => {
    const getClient = await getClientMock();
    getClient.mockReturnValue(null);
    const { mirrorEvent } = await import('../eventMirror');
    expect(() => mirrorEvent('game_start', 'u')).not.toThrow();
  });
});
