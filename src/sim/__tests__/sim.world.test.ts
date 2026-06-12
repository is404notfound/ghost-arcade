import { describe, test, expect } from 'vitest';
import { GameSim, speedAtSec, intervalMsAtSec } from '../sim';
import * as C from '../constants';

function stepN(sim: GameSim, n: number): void {
  for (let i = 0; i < n; i++) sim.step();
}

// 체력 사망으로 월드 관찰이 끊기지 않도록 — 테스트 전용 불사 처리
function immortal(sim: GameSim): GameSim {
  sim.state.hp = 1e9;
  return sim;
}

describe('GameSim — 에스컬레이션 곡선', () => {
  test('속도는 기본값에서 시작해 초당 RAMP만큼 증가한다', () => {
    expect(speedAtSec(0)).toBe(C.SPEED_BASE);
    expect(speedAtSec(1)).toBeCloseTo(C.SPEED_BASE + C.SPEED_RAMP, 5);
    expect(speedAtSec(10)).toBeCloseTo(C.SPEED_BASE + 10 * C.SPEED_RAMP, 5);
  });

  test('속도는 SPEED_MAX에서 상한된다 (Phase 0 학습: 벽 방지)', () => {
    expect(speedAtSec(1000)).toBe(C.SPEED_MAX);
  });

  test('스폰 간격은 기본값에서 줄어들되 하한에서 멈춘다', () => {
    expect(intervalMsAtSec(0)).toBe(C.INTERVAL_BASE_MS);
    expect(intervalMsAtSec(1000)).toBe(C.INTERVAL_MIN_MS);
  });
});

describe('GameSim — 장애물', () => {
  test('처음에는 활성 장애물이 없다', () => {
    const sim = immortal(new GameSim(1));
    stepN(sim, 30); // 첫 스폰 간격(1500ms=90프레임) 전
    expect(sim.state.obstacles.filter((o) => o.active)).toHaveLength(0);
  });

  test('첫 스폰 간격이 지나면 장애물이 화면 오른쪽 바깥에 등장한다', () => {
    const sim = immortal(new GameSim(1));
    stepN(sim, 91); // 첫 간격(1500ms = 90프레임) 직후
    const active = sim.state.obstacles.filter((o) => o.active);
    expect(active).toHaveLength(1);
    const obs = active[0]!;
    // 스폰 직후 1-2스텝 이동분만 허용 — SPAWN_X 부근에서 등장해야 함
    expect(obs.x).toBeGreaterThan(C.SPAWN_X - 3 * C.SPEED_BASE * C.DT);
    expect(obs.x).toBeLessThanOrEqual(C.SPAWN_X);
  });

  test('장애물 높이는 OBS_H_MIN..OBS_H_MAX 범위의 정수다', () => {
    const sim = immortal(new GameSim(7));
    stepN(sim, 95);
    const obs = sim.state.obstacles.find((o) => o.active)!;
    expect(Number.isInteger(obs.h)).toBe(true);
    expect(obs.h).toBeGreaterThanOrEqual(C.OBS_H_MIN);
    expect(obs.h).toBeLessThanOrEqual(C.OBS_H_MAX);
  });

  test('장애물은 매 스텝 현재 속도 × DT만큼 왼쪽으로 이동한다', () => {
    const sim = immortal(new GameSim(1));
    stepN(sim, 95);
    const obs = sim.state.obstacles.find((o) => o.active)!;
    const x0 = obs.x;
    const t = sim.state.frame * C.DT;
    sim.step();
    expect(obs.x).toBeCloseTo(x0 - speedAtSec(t) * C.DT, 5);
  });

  test('화면 밖으로 나간 장애물은 비활성화되고 풀 객체는 재사용된다 (D6 제로 할당)', () => {
    const sim = immortal(new GameSim(3));
    const poolRefs = [...sim.state.obstacles];
    expect(poolRefs).toHaveLength(C.MAX_OBSTACLES);

    let activations = 0;
    const wasActive = sim.state.obstacles.map(() => false);
    for (let i = 0; i < 4000; i++) {
      sim.step();
      sim.state.obstacles.forEach((o, j) => {
        if (o.active && !wasActive[j]) activations++;
        wasActive[j] = o.active;
      });
    }

    // 배열도 원소 객체도 같은 인스턴스 그대로 (재할당 없음)
    sim.state.obstacles.forEach((o, j) => expect(o).toBe(poolRefs[j]));
    // 풀 크기보다 많은 스폰이 일어났다 = 슬롯 재사용이 실제로 발생
    expect(activations).toBeGreaterThan(C.MAX_OBSTACLES);
    // 동시 활성 수는 풀 한도 이내
    expect(sim.state.obstacles.filter((o) => o.active).length).toBeLessThanOrEqual(C.MAX_OBSTACLES);
  });
});

describe('GameSim — 거리 점수', () => {
  test('거리는 매 스텝 현재 속도의 적분을 미터로 환산해 누적한다', () => {
    const sim = immortal(new GameSim(1));
    let expected = 0;
    for (let f = 0; f < 60; f++) {
      expected += (speedAtSec(f * C.DT) * C.DT) / C.UNITS_PER_METER;
    }
    stepN(sim, 60);
    expect(sim.state.distance).toBeCloseTo(expected, 6);
  });
});
