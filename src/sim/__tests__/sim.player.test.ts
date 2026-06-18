import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

function stepN(sim: GameSim, n: number): void {
  for (let i = 0; i < n; i++) sim.step();
}

describe('GameSim — 플레이어 물리', () => {
  test('초기 상태: 지상, 체력 가득, 거리 0, 프레임 0', () => {
    const sim = new GameSim(1);
    expect(sim.state.frame).toBe(0);
    expect(sim.state.gameOver).toBe(false);
    expect(sim.state.hp).toBe(C.HP_MAX);
    expect(sim.state.distance).toBe(0);
    expect(sim.state.player.y).toBe(0);
    expect(sim.state.player.vy).toBe(0);
  });

  test('탭하면 다음 스텝에서 점프 속도를 얻고 상승한다', () => {
    const sim = new GameSim(1);
    sim.queueTap();
    sim.step();
    expect(sim.state.player.vy).toBeGreaterThan(0);
    expect(sim.state.player.y).toBeGreaterThan(0);
  });

  test('MAX_JUMPS번 점프가 가능하다 (지상 포함)', () => {
    const sim = new GameSim(1);
    for (let j = 0; j < C.MAX_JUMPS; j++) {
      sim.queueTap();
      sim.step();
      // 점프 직후 속도가 점프 초속으로 재설정됨 (한 스텝 중력 적분 포함)
      expect(sim.state.player.vy).toBeCloseTo(C.JUMP_VEL - C.GRAVITY * C.DT, 5);
      stepN(sim, 5); // 공중 유지
    }
  });

  test('MAX_JUMPS+1번째 점프는 무시된다', () => {
    const sim = new GameSim(1);
    for (let j = 0; j < C.MAX_JUMPS; j++) {
      sim.queueTap();
      sim.step();
    }
    const vyBefore = sim.state.player.vy;
    sim.queueTap();
    sim.step();
    // 점프가 적용됐다면 vy가 JUMP_VEL로 리셋됐을 것 — 중력 적분만 일어나야 함
    expect(sim.state.player.vy).toBeCloseTo(vyBefore - C.GRAVITY * C.DT, 5);
  });

  test('중력으로 착지하며 y는 0 아래로 내려가지 않는다', () => {
    const sim = new GameSim(1);
    sim.queueTap();
    sim.step();
    stepN(sim, 600); // 충분히 진행
    expect(sim.state.player.y).toBe(0);
    expect(sim.state.player.vy).toBe(0);
  });

  test('착지하면 점프 카운트가 리셋된다 (프로토 3단 점프 버그 회귀 방지)', () => {
    const sim = new GameSim(1);
    // 2단 다 쓰고 착지
    sim.queueTap();
    sim.step();
    sim.queueTap();
    sim.step();
    let guard = 0;
    while (sim.state.player.y > 0 && guard++ < 1000) sim.step();
    expect(sim.state.player.y).toBe(0);
    // 착지 후 다시 점프 가능
    sim.queueTap();
    sim.step();
    expect(sim.state.player.vy).toBeGreaterThan(0);
  });
});

describe('GameSim — 체력 수명주기', () => {
  test('체력은 초당 HP_DRAIN_PER_SEC씩 자연 감소한다', () => {
    const sim = new GameSim(1);
    stepN(sim, 60); // 1초 (충돌 발생 전 구간)
    expect(sim.state.hp).toBeCloseTo(C.HP_MAX - C.HP_DRAIN_PER_SEC, 3);
  });

  test('체력이 0이 되면 게임오버가 된다', () => {
    const sim = new GameSim(1);
    let guard = 0;
    while (!sim.state.gameOver && guard++ < 10000) sim.step();
    expect(sim.state.gameOver).toBe(true);
    expect(sim.state.hp).toBe(0);
  });

  test('게임오버 후 step은 상태를 진행시키지 않는다', () => {
    const sim = new GameSim(1);
    let guard = 0;
    while (!sim.state.gameOver && guard++ < 10000) sim.step();
    const frame = sim.state.frame;
    const distance = sim.state.distance;
    sim.step();
    expect(sim.state.frame).toBe(frame);
    expect(sim.state.distance).toBe(distance);
  });

  test('게임오버 다음 step부터 events는 비워진다 (EV_GAME_OVER 반복 발화 방지)', () => {
    const sim = new GameSim(1);
    let guard = 0;
    while (!sim.state.gameOver && guard++ < 10000) sim.step();
    expect(sim.state.events & C.EV_GAME_OVER).toBeTruthy(); // 죽은 그 스텝엔 켜져 있고
    sim.step();
    expect(sim.state.events).toBe(0); // 그 다음 스텝부터는 꺼져야 한다
  });
});
