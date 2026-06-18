import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

/** 다음 step에서 타이머 피버 발동: feverTimerFrames = threshold-1, combo > 0 */
function arrangeFeverTrigger(sim: GameSim): void {
  sim.state.feverFramesLeft = 0;
  sim.state.feverGraceFramesLeft = 0;
  sim.state.feverTimerFrames = Math.round(C.FEVER_INTERVAL_SEC * C.SIM_FPS) - 1;
  sim.state.combo = 5;
  sim.state.invincibleFrames = 999;
}

describe('GameSim — 피버타임', () => {
  test('초기 feverFramesLeft는 0이다', () => {
    const sim = new GameSim(1);
    expect(sim.state.feverFramesLeft).toBe(0);
  });

  test('콤보가 끊기지 않고 FEVER_INTERVAL_SEC 초 유지하면 피버가 발동된다', () => {
    const sim = new GameSim(1);
    arrangeFeverTrigger(sim);
    sim.step();
    expect(sim.state.feverFramesLeft).toBeGreaterThan(0);
    expect(sim.state.events & C.EV_FEVER_START).toBeTruthy();
  });

  test('피버 발동 후 combo가 변하지 않는다', () => {
    const sim = new GameSim(1);
    arrangeFeverTrigger(sim);
    const comboBefore = sim.state.combo;
    sim.step();
    expect(sim.state.combo).toBe(comboBefore);
  });

  test('피버 발동 시 feverFramesLeft = FEVER_SEC * SIM_FPS이다', () => {
    const sim = new GameSim(1);
    arrangeFeverTrigger(sim);
    sim.step();
    expect(sim.state.feverFramesLeft).toBe(Math.round(C.FEVER_SEC * C.SIM_FPS));
  });

  test('feverFramesLeft는 매 스텝 감소한다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.invincibleFrames = 999;
    const before = sim.state.feverFramesLeft;
    sim.step();
    expect(sim.state.feverFramesLeft).toBe(before - 1);
  });

  test('feverFramesLeft가 0이 되면 EV_FEVER_END가 발화한다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = Math.round(C.FEVER_SEC * C.SIM_FPS);
    sim.state.invincibleFrames = 9999;
    const total = sim.state.feverFramesLeft;
    let endFired = false;
    for (let i = 0; i < total; i++) {
      sim.step();
      if (sim.state.events & C.EV_FEVER_END) {
        endFired = true;
        break;
      }
    }
    expect(endFired).toBe(true);
    expect(sim.state.feverFramesLeft).toBe(0);
  });

  test('피버 중에는 MAX_JUMPS 제한 없이 점프가 가능하다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.player.jumpsUsed = C.MAX_JUMPS;
    sim.state.player.y = 200;
    sim.state.player.vy = 0;
    sim.queueTap();
    sim.step();
    expect(sim.state.events & C.EV_JUMP).toBeTruthy();
  });

  test('피버 종료 후에는 MAX_JUMPS 제한이 복귀한다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 1;
    sim.step();
    expect(sim.state.feverFramesLeft).toBe(0);
    sim.state.player.y = 0;
    sim.state.player.vy = 0;
    sim.state.player.jumpsUsed = C.MAX_JUMPS;
    sim.state.player.y = 200;
    sim.queueTap();
    sim.step();
    expect(sim.state.events & C.EV_JUMP).toBeFalsy();
  });

  test('피버 중 장애물에 겹쳐도 피버가 유지되고 피격이 발생하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.combo = 3;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeFalsy();
    expect(sim.state.feverFramesLeft).toBeGreaterThan(0);
    expect(sim.state.combo).toBe(3);
    expect(sim.state.hp).toBeCloseTo(hpBefore, 5);
  });

  test('피버 상태도 결정론에 포함된다 — 같은 시드·입력이면 동일', () => {
    const a = new GameSim(222);
    const b = new GameSim(222);
    for (let i = 0; i < 1500; i++) {
      if (i % 40 === 0) { a.queueTap(); b.queueTap(); }
      a.step(); b.step();
    }
    expect(a.state.feverFramesLeft).toBe(b.state.feverFramesLeft);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
