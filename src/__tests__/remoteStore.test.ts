import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createInputLog, serializeLog, SIM_VERSION } from '../sim/inputLog';
import { saveRun, loadTopRuns } from '../ghostStore';

vi.mock('../supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@sentry/browser', () => ({
  captureException: vi.fn(),
}));

const seed = 20240101;
const log = createInputLog(seed);

/** SELECT 체인 + INSERT를 모두 지원하는 Supabase 쿼리 빌더 목업.
 *  SELECT: .select().eq().eq().order().limit().abortSignal(signal) → Promise
 *  INSERT: .insert()                                               → Promise
 */
function makeChain(
  queryResult: unknown = { data: [], error: null },
  insertResult: unknown = { error: null },
) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),           // 체인 유지
    abortSignal: vi.fn().mockResolvedValue(queryResult), // 여기서 최종 resolve
    insert: vi.fn().mockResolvedValue(insertResult),
  };
  return { client: { from: vi.fn().mockReturnValue(chain) }, chain };
}

// 동적 임포트 — vi.mock 훅이 적용된 버전을 가져온다
async function importRemote() {
  const { loadTopRunsRemote, submitRunRemote } = await import('../remoteStore');
  return { loadTopRunsRemote, submitRunRemote };
}

async function getGetSupabaseClient() {
  const { getSupabaseClient } = await import('../supabaseClient');
  return vi.mocked(getSupabaseClient);
}

// 각 테스트 전에 모듈 캐시와 mock 호출 카운트를 초기화한다
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// loadTopRunsRemote
// ─────────────────────────────────────────────

describe('loadTopRunsRemote', () => {
  it('Supabase 미설정: 빈 배열 반환', async () => {
    const getClient = await getGetSupabaseClient();
    getClient.mockReturnValue(null);
    const { loadTopRunsRemote } = await importRemote();

    expect(await loadTopRunsRemote(seed)).toEqual([]);
  });

  it('정상 응답: distance 내림차순 GhostRecord 반환', async () => {
    const getClient = await getGetSupabaseClient();
    const logObj = JSON.parse(serializeLog(log)) as unknown; // JSONB 객체처럼 취급
    const { client } = makeChain({
      data: [{ distance: 100, log: logObj }],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadTopRunsRemote } = await importRemote();

    const result = await loadTopRunsRemote(seed);
    expect(result).toHaveLength(1);
    expect(result[0]!.distance).toBe(100);
    expect(result[0]!.log.seed).toBe(seed);
  });

  it('네트워크 오류: 빈 배열 반환, 예외 미전파', async () => {
    const getClient = await getGetSupabaseClient();
    const { client } = makeChain({ data: null, error: new Error('network') });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadTopRunsRemote } = await importRemote();

    await expect(loadTopRunsRemote(seed)).resolves.toEqual([]);
  });

  it('손상 레코드 스킵: 유효 레코드만 반환', async () => {
    const getClient = await getGetSupabaseClient();
    const logObj = JSON.parse(serializeLog(log)) as unknown;
    const { client } = makeChain({
      data: [
        { distance: 200, log: logObj },
        { distance: 100, log: { corrupted: true } }, // 스키마 불일치
      ],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadTopRunsRemote } = await importRemote();

    const result = await loadTopRunsRemote(seed);
    expect(result).toHaveLength(1);
    expect(result[0]!.distance).toBe(200);
  });

  it('타임아웃(5초 초과): 빈 배열 반환, 예외 미전파', async () => {
    vi.useFakeTimers();
    const getClient = await getGetSupabaseClient();

    // AbortSignal이 abort되면 AbortError로 reject하는 체인 (hang 시뮬레이션)
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockImplementation((signal: AbortSignal) =>
        new Promise<{ data: null; error: unknown }>((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
      ),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as any);
    const { loadTopRunsRemote } = await importRemote();

    const resultPromise = loadTopRunsRemote(seed);
    vi.advanceTimersByTime(5001); // REMOTE_TIMEOUT_MS 초과
    const result = await resultPromise;

    expect(result).toEqual([]);
    vi.useRealTimers();
  });

  it('meta 컬럼 없음(42703): meta 제외 select로 재시도해 데이터 반환', async () => {
    const getClient = await getGetSupabaseClient();
    const logObj = JSON.parse(serializeLog(log)) as unknown;
    const { client, chain } = makeChain();
    chain.abortSignal
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column ghost_runs.meta does not exist' } })
      .mockResolvedValueOnce({ data: [{ distance: 100, log: logObj }], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadTopRunsRemote } = await importRemote();

    const result = await loadTopRunsRemote(seed);
    expect(result).toHaveLength(1);
    expect(result[0]!.distance).toBe(100);
    // 재시도 select는 meta 없이 호출되어야 한다
    expect(chain.select).toHaveBeenLastCalledWith('distance, log');
  });

  it('시드 불일치 레코드 스킵', async () => {
    const getClient = await getGetSupabaseClient();
    const otherLog = createInputLog(99999);
    const logObj = JSON.parse(serializeLog(otherLog)) as unknown;
    const { client } = makeChain({
      data: [{ distance: 100, log: logObj }],
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { loadTopRunsRemote } = await importRemote();

    const result = await loadTopRunsRemote(seed);
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// submitRunRemote
// ─────────────────────────────────────────────

describe('submitRunRemote', () => {
  it('정상 제출: insert 호출, distance 포함', async () => {
    const getClient = await getGetSupabaseClient();
    const { client, chain } = makeChain(undefined, { error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { submitRunRemote } = await importRemote();

    await submitRunRemote(seed, log, 150);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ distance: 150, sim_version: SIM_VERSION }),
    );
  });

  it('이상치 거리(>상한): insert 미호출', async () => {
    const getClient = await getGetSupabaseClient();
    const { client, chain } = makeChain(undefined, { error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { submitRunRemote } = await importRemote();

    // SPEED_MAX(660) / UNITS_PER_METER(30) × 900초 ≈ 19,800m 상한
    await submitRunRemote(seed, log, 99_999);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('음수 거리: insert 미호출', async () => {
    const getClient = await getGetSupabaseClient();
    const { client, chain } = makeChain(undefined, { error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { submitRunRemote } = await importRemote();

    await submitRunRemote(seed, log, -1);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('meta 컬럼 없음(PGRST204): meta 빼고 재시도해 기록을 살린다', async () => {
    const getClient = await getGetSupabaseClient();
    const { client, chain } = makeChain();
    chain.insert
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'meta' column" } })
      .mockResolvedValueOnce({ error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { submitRunRemote } = await importRemote();

    await submitRunRemote(seed, log, 150, false, { nickname: '테스터' });
    expect(chain.insert).toHaveBeenCalledTimes(2);
    // 1차는 meta 포함, 2차(재시도)는 meta 제외
    expect(chain.insert.mock.calls[0]![0]).toHaveProperty('meta');
    expect(chain.insert.mock.calls[1]![0]).not.toHaveProperty('meta');

    const { captureException } = await import('@sentry/browser');
    expect(vi.mocked(captureException)).not.toHaveBeenCalled();
  });

  it('네트워크 오류: 예외 미전파', async () => {
    const getClient = await getGetSupabaseClient();
    const { client } = makeChain(undefined, { error: new Error('network') });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue(client as any);
    const { submitRunRemote } = await importRemote();

    await expect(submitRunRemote(seed, log, 100)).resolves.toBeUndefined();
  });

  it('INSERT 타임아웃(5초 초과): 예외 미전파, Sentry AbortError 미보고', async () => {
    vi.useFakeTimers();
    const getClient = await getGetSupabaseClient();

    const chain = {
      // INSERT가 영원히 pending인 상황 시뮬레이션
      insert: vi.fn().mockReturnValue(new Promise<{ error: unknown }>(() => {})),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as any);
    const { submitRunRemote } = await importRemote();

    const resultPromise = submitRunRemote(seed, log, 100);
    vi.advanceTimersByTime(5001); // REMOTE_TIMEOUT_MS 초과
    await expect(resultPromise).resolves.toBeUndefined();

    const { captureException } = await import('@sentry/browser');
    expect(vi.mocked(captureException)).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('Supabase 미설정: 예외 없이 반환', async () => {
    const getClient = await getGetSupabaseClient();
    getClient.mockReturnValue(null);
    const { submitRunRemote } = await importRemote();

    await expect(submitRunRemote(seed, log, 100)).resolves.toBeUndefined();
  });

  it('CRITICAL: 원격 실패 시 로컬 ghostStore 독립 동작', () => {
    // 원격 저장소가 완전히 차단돼도 로컬 KVStore는 정상 동작해야 한다
    const store = new Map<string, string>();
    const kvStore = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };
    saveRun(kvStore, seed, log, 100);
    const localRuns = loadTopRuns(kvStore, seed);
    expect(localRuns).toHaveLength(1);
    expect(localRuns[0]!.distance).toBe(100);
  });
});
