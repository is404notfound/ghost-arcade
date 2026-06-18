import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

describe('GameSim — 피버 충돌 면역 (0.6.0)', () => {
  test('피버 중 장애물에 겹쳐도 EV_HIT가 발화하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
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

  test('피버 중에는 드레인도 충돌 데미지도 없어 HP가 변하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.hp).toBeCloseTo(hpBefore, 5);
  });

  test('피버 중 장애물 겹침 시 invincibleFrames가 설정되지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    sim.step();
    expect(sim.state.invincibleFrames).toBe(0);
  });

  test('피버 중 콤보가 리셋되지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.combo = 5;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    sim.step();
    expect(sim.state.combo).toBe(5);
    expect(sim.state.events & C.EV_COMBO_BREAK).toBeFalsy();
  });

  test('피버 중엔 feverTimerFrames가 0으로 유지된다 (타이머 멈춤)', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.feverTimerFrames = 0;
    sim.state.combo = 5;
    sim.state.invincibleFrames = 0;
    sim.state.player.y = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X;
    sim.step();
    expect(sim.state.feverTimerFrames).toBe(0);
  });

  test('피버 밖에서는 충돌 데미지가 정상 적용된다 (회귀)', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
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
});

describe('GameSim — 피버 탭 회복 (0.7.0)', () => {
  test('피버 중 탭 1회당 FEVER_TAP_HEAL만큼 HP가 회복된다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.hp = 50;
    sim.state.invincibleFrames = 999;
    sim.queueTap();
    sim.step();
    // 피버 중: 드레인 없음 + 탭 회복
    expect(sim.state.hp).toBeCloseTo(50 + C.FEVER_TAP_HEAL, 5);
  });

  test('피버 탭 회복은 HP_MAX에서 클램프된다', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 100;
    sim.state.hp = C.HP_MAX - 1; // 1 부족
    sim.state.invincibleFrames = 999;
    sim.queueTap();
    sim.step();
    expect(sim.state.hp).toBe(C.HP_MAX);
  });

  test('피버 밖에서 탭해도 HP가 회복되지 않는다 (회귀)', () => {
    const sim = new GameSim(1);
    sim.state.feverFramesLeft = 0;
    sim.state.hp = 50;
    sim.state.invincibleFrames = 999;
    const hpBefore = sim.state.hp;
    sim.queueTap();
    sim.step();
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });
});
