import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

describe('GameSim — 점프 천장 클램프 (0.6.0)', () => {
  test('무한 점프해도 player.y가 PLAYER_Y_MAX 이하이다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 9999; // 무한 점프 허용
    for (let i = 0; i < 120; i++) {
      sim.queueTap();
      sim.step();
      expect(sim.state.player.y).toBeLessThanOrEqual(C.PLAYER_Y_MAX);
    }
  });

  test('PLAYER_Y_MAX에서 양의 vy는 0으로 클램프된다', () => {
    const sim = new GameSim(1);
    sim.state.player.y = C.PLAYER_Y_MAX;
    sim.state.player.vy = 500;
    sim.state.invincibleFrames = 9999;
    sim.step();
    expect(sim.state.player.y).toBeLessThanOrEqual(C.PLAYER_Y_MAX);
    expect(sim.state.player.vy).toBe(0);
  });

  test('PLAYER_Y_MAX 미만에서는 정상 점프 궤도를 따른다', () => {
    const sim = new GameSim(1);
    sim.state.invincibleFrames = 9999;
    sim.queueTap(); // 1단 점프
    sim.step();
    // 첫 점프 직후는 PLAYER_Y_MAX보다 훨씬 낮고 vy는 양수 (클램프 발생하지 않아야 함)
    expect(sim.state.player.y).toBeLessThan(C.PLAYER_Y_MAX);
    expect(sim.state.player.vy).toBeGreaterThan(0);
  });

  test('천장 클램프도 결정론에 포함된다', () => {
    const a = new GameSim(42);
    const b = new GameSim(42);
    for (let i = 0; i < 500; i++) {
      if (i % 15 === 0) { a.queueTap(); b.queueTap(); }
      a.step(); b.step();
    }
    expect(a.state.player.y).toBe(b.state.player.y);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
