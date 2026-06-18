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

describe('GameSim — 피버 시간 기반 타이머 (0.9.0)', () => {
  // HP 드레인
  test('피버 중에는 HP 드레인이 없다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 10;
    sim.state.invincibleFrames = 999;
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.hp).toBeCloseTo(hpBefore, 5);
  });

  test('HP 드레인은 피버 없이도 동일하게 적용된다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.invincibleFrames = 999;
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });

  // 속도
  test('피버 중 s.speed가 기본의 FEVER_SPEED_MULT배이다', () => {
    const normal = new GameSim(1);
    normal.step();

    const fever = new GameSim(1);
    fever.state.feverFramesLeft = 10;
    fever.state.invincibleFrames = 999;
    fever.step();

    expect(fever.state.speed).toBeCloseTo(normal.state.speed * C.FEVER_SPEED_MULT, 3);
  });

  test('피버 비활성 시 s.speed가 FEVER_SPEED_MULT 미적용이다', () => {
    const sim = new GameSim(1);
    sim.step();
    const normalSpeed = sim.state.speed;

    const feverSim = new GameSim(1);
    feverSim.state.feverFramesLeft = 100;
    feverSim.state.invincibleFrames = 999;
    feverSim.step();

    expect(feverSim.state.speed / normalSpeed).toBeCloseTo(C.FEVER_SPEED_MULT, 3);
  });

  test('피버 중 거리가 기본의 FEVER_SPEED_MULT배로 누적된다', () => {
    const normal = new GameSim(1);
    normal.step();

    const fever = new GameSim(1);
    fever.state.feverFramesLeft = 10;
    fever.state.invincibleFrames = 999;
    fever.step();

    expect(fever.state.distance).toBeCloseTo(normal.state.distance * C.FEVER_SPEED_MULT, 3);
  });

  // 타이머 기반 발동
  test('초기 feverTimerFrames는 0이다', () => {
    const sim = new GameSim(1);
    expect(sim.state.feverTimerFrames).toBe(0);
  });

  test('combo > 0이면 feverTimerFrames가 매 step 1씩 증가한다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 3;
    sim.state.feverFramesLeft = 0;
    sim.state.invincibleFrames = 999;
    const before = sim.state.feverTimerFrames;
    sim.step();
    expect(sim.state.feverTimerFrames).toBe(before + 1);
  });

  test('combo = 0이면 feverTimerFrames가 증가하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 0;
    sim.state.feverFramesLeft = 0;
    sim.state.feverTimerFrames = 10;
    sim.state.invincibleFrames = 999;
    sim.step();
    expect(sim.state.feverTimerFrames).toBe(10);
  });

  test('피버 중엔 feverTimerFrames가 증가하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.feverTimerFrames = 0;
    sim.state.combo = 5;
    sim.state.invincibleFrames = 999;
    sim.step();
    expect(sim.state.feverTimerFrames).toBe(0);
  });

  test('피버 발동 시 feverTimerFrames가 0으로 리셋된다', () => {
    const sim = new GameSim(1);
    arrangeFeverTrigger(sim);
    sim.step();
    expect(sim.state.feverTimerFrames).toBe(0);
  });

  test('피격 시 feverTimerFrames가 0으로 리셋된다', () => {
    const sim = new GameSim(1);
    sim.state.feverTimerFrames = 50;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.feverTimerFrames).toBe(0);
  });

  test('피버 종료 후 FEVER_INTERVAL_SEC 초 콤보 유지 시 재발동된다', () => {
    const sim = new GameSim(1);
    // 1차 발동
    arrangeFeverTrigger(sim);
    sim.step();
    expect(sim.state.events & C.EV_FEVER_START).toBeTruthy();
    // 피버·유예 즉시 종료 (직접 설정으로 단축)
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    // 2차 발동 조건 재설정
    arrangeFeverTrigger(sim);
    sim.step();
    expect(sim.state.events & C.EV_FEVER_START).toBeTruthy();
  });

  test('타이머 미달 시 피버가 발동하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverTimerFrames = Math.round(C.FEVER_INTERVAL_SEC * C.SIM_FPS) - 2;
    sim.state.combo = 5;
    sim.state.feverFramesLeft = 0;
    sim.state.invincibleFrames = 999;
    sim.step();
    expect(sim.state.events & C.EV_FEVER_START).toBeFalsy();
    expect(sim.state.feverFramesLeft).toBe(0);
  });

  test('feverTimerFrames·speed는 결정론에 포함된다', () => {
    const a = new GameSim(333);
    const b = new GameSim(333);
    for (let i = 0; i < 2000; i++) {
      if (i % 38 === 0) { a.queueTap(); b.queueTap(); }
      a.step(); b.step();
    }
    expect(a.state.feverTimerFrames).toBe(b.state.feverTimerFrames);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
