import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

describe('GameSim — 피버 종료 후 충돌 유예 (0.8.0)', () => {
  test('피버가 끝나면 feverGraceFramesLeft가 FEVER_GRACE_SEC * SIM_FPS로 설정된다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 1;
    sim.state.invincibleFrames = 999;
    sim.step(); // section 1: grace 감소(0→0), fever 1→0, grace 설정
    expect(sim.state.feverGraceFramesLeft).toBe(Math.round(C.FEVER_GRACE_SEC * C.SIM_FPS));
  });

  test('feverGraceFramesLeft는 매 step 1씩 감소한다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 50;
    sim.state.invincibleFrames = 999;
    sim.step();
    expect(sim.state.feverGraceFramesLeft).toBe(49);
  });

  test('유예 중(feverGraceFramesLeft > 0) 충돌해도 EV_HIT가 발화하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 10;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeFalsy();
  });

  test('유예 종료(feverGraceFramesLeft = 0) 후 충돌 데미지가 정상 복귀한다 (회귀)', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HIT_DAMAGE - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });

  test('유예 중에도 자연 드레인이 적용된다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 100;
    sim.state.invincibleFrames = 999;
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });

  test('유예 중 탭해도 HP가 회복되지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 100;
    sim.state.hp = 50;
    sim.state.invincibleFrames = 999;
    const hpBefore = sim.state.hp;
    sim.queueTap();
    sim.step();
    // grace 중: 탭 회복 없음(feverFramesLeft=0), 드레인만 적용
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });

  test('유예 상태도 결정론에 포함된다', () => {
    const a = new GameSim(77);
    const b = new GameSim(77);
    for (let i = 0; i < 2000; i++) {
      if (i % 35 === 0) { a.queueTap(); b.queueTap(); }
      a.step(); b.step();
    }
    expect(a.state.feverGraceFramesLeft).toBe(b.state.feverGraceFramesLeft);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
