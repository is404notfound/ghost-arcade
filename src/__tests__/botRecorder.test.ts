import { describe, it, expect } from 'vitest';
import { parseLog, serializeLog, SIM_VERSION } from '../sim/inputLog';
import type { BotProfile } from '../botRecorder';

async function getBotRecorder() {
  const { recordBotRun, recordAllBotRuns } = await import('../botRecorder');
  return { recordBotRun, recordAllBotRuns };
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
