import { describe, it, expect } from 'vitest';
import { parseLog, serializeLog, SIM_VERSION } from '../sim/inputLog';
import type { BotProfile } from '../botRecorder';

async function getBotRecorder() {
  const { recordBotRun, recordAllBotRuns, recordAllBotRunsAsync, recordReactiveBotRun } =
    await import('../botRecorder');
  return { recordBotRun, recordAllBotRuns, recordAllBotRunsAsync, recordReactiveBotRun };
}

const seed = 20240101;

describe('recordBotRun', () => {
  it('유효한 InputLog를 생성한다', async () => {
    const { recordBotRun } = await getBotRecorder();
    const { log } = recordBotRun(seed, 'casual');

    expect(log.version).toBe(SIM_VERSION);
    expect(log.seed).toBe(seed);
    expect(log.events.length).toBeGreaterThan(0);
  });

  it('생성된 로그를 parseLog로 재검증할 수 있다', async () => {
    const { recordBotRun } = await getBotRecorder();
    const { log } = recordBotRun(seed, 'skilled');

    expect(() => parseLog(serializeLog(log))).not.toThrow();
  });

  it('양수 거리를 기록한다', async () => {
    const { recordBotRun } = await getBotRecorder();
    const { distance } = recordBotRun(seed, 'pro');

    expect(distance).toBeGreaterThan(0);
  });

  it('같은 시드·프로파일은 동일한 결과를 낸다 (결정론)', async () => {
    const { recordBotRun } = await getBotRecorder();
    const a = recordBotRun(seed, 'casual');
    const b = recordBotRun(seed, 'casual');

    expect(a.distance).toBe(b.distance);
    expect(a.log.events).toEqual(b.log.events);
  });

  it('프로파일마다 다른 이벤트 수를 낸다', async () => {
    const { recordBotRun } = await getBotRecorder();
    const profiles: BotProfile[] = ['casual', 'skilled', 'pro'];
    const counts = profiles.map((p) => recordBotRun(seed, p).log.events.length);

    // 세 값이 모두 동일하면 프로파일 분화가 안 된 것
    expect(new Set(counts).size).toBeGreaterThan(1);
  });
});

describe('recordAllBotRuns', () => {
  it('8개 BotRunResult를 반환한다', async () => {
    const { recordAllBotRuns } = await getBotRecorder();
    const results = recordAllBotRuns(seed);

    expect(results).toHaveLength(8);
  });

  it('모든 결과의 거리가 양수다', async () => {
    const { recordAllBotRuns } = await getBotRecorder();
    const results = recordAllBotRuns(seed);

    expect(results.every((r) => r.distance > 0)).toBe(true);
  });

  it('결과들이 거리 내림차순으로 정렬돼 있다', async () => {
    const { recordAllBotRuns } = await getBotRecorder();
    const results = recordAllBotRuns(seed);
    const distances = results.map((r) => r.distance);

    for (let i = 0; i < distances.length - 1; i++) {
      expect(distances[i]!).toBeGreaterThanOrEqual(distances[i + 1]!);
    }
  });
});

// ─────────────────────────────────────────────
// recordReactiveBotRun (반응형 봇 — 장거리 커버리지)
// ─────────────────────────────────────────────

describe('recordReactiveBotRun', () => {
  it('결정론: 같은 (seed, target, opts)는 동일한 로그·거리', async () => {
    const { recordReactiveBotRun } = await getBotRecorder();
    const a = recordReactiveBotRun(seed, 3000, { missPct: 0.05 });
    const b = recordReactiveBotRun(seed, 3000, { missPct: 0.05 });

    expect(a.distance).toBe(b.distance);
    expect(a.log.events).toEqual(b.log.events);
  });

  it('리플레이 재현: 생성 로그를 replay하면 같은 거리 (서버 검증 무결성)', async () => {
    const { recordReactiveBotRun } = await getBotRecorder();
    const { replay } = await import('../sim/sim');
    const { log, distance } = recordReactiveBotRun(seed, 2000, { missPct: 0.03 });

    const sim = replay(log, 200_000); // 사망 프레임 이후는 no-op
    expect(sim.state.distance).toBeCloseTo(distance, 6);
  });

  it('target 도달 후 자연사 — 최종 거리가 target 근방(+600m 이내)', async () => {
    const { recordReactiveBotRun } = await getBotRecorder();
    const { distance } = recordReactiveBotRun(seed, 1500, { missPct: 0 });

    expect(distance).toBeLessThan(1500 + 600);
  });
});

describe('recordAllBotRuns — 장거리 커버리지', () => {
  // 시드 특이 구간이 있어도 장거리 경쟁자가 보장되는지 — 시드별로 검증
  it.each([3061741561, 20240101, 42])(
    '시드 %i: 최소 2봇이 3000m 이상, 최고 봇은 이상치 상한 미만',
    async (s) => {
      const { recordAllBotRuns } = await getBotRecorder();
      const distances = recordAllBotRuns(s).map((r) => r.distance);

      expect(distances.filter((d) => d >= 3000).length).toBeGreaterThanOrEqual(2);
      // 이상치 필터(remoteStore DISTANCE_OUTLIER_CEILING ≈ 19,800m)에 안 걸려야 서버에 저장된다
      expect(distances[0]!).toBeLessThan(19_000);
    },
  );

  it('초반 사망(~500m 미만) 봇도 존재 — 신규 유저가 이길 상대', async () => {
    const { recordAllBotRuns } = await getBotRecorder();
    const distances = recordAllBotRuns(seed).map((r) => r.distance);

    expect(distances.some((d) => d < 500)).toBe(true);
  });

  it('recordAllBotRunsAsync는 동기 버전과 동일한 결과 (결정론)', async () => {
    const { recordAllBotRuns, recordAllBotRunsAsync } = await getBotRecorder();
    const sync = recordAllBotRuns(seed);
    const async_ = await recordAllBotRunsAsync(seed);

    expect(async_.map((r) => r.distance)).toEqual(sync.map((r) => r.distance));
  });
});
