import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

/** 지면에서 플레이어와 겹치는 장애물을 슬롯 0에 깐다. */
function placeHitObstacle(sim: GameSim): void {
  sim.state.player.y = 0;
  sim.state.invincibleFrames = 0;
  sim.state.feverFramesLeft = 0;
  sim.state.feverGraceFramesLeft = 0;
  const obs = sim.state.obstacles[0]!;
  obs.active = true;
  obs.h = 60;
  obs.w = C.OBS_W;
  obs.scored = false;
  obs.x = C.PLAYER_X;
}

/** 피버를 강제로 한 번 발동시킨다 (초심자 보호 종료). */
function forceFeverOnce(sim: GameSim): void {
  sim.state.combo = 1;
  sim.state.feverTimerFrames = Math.round(C.FEVER_INTERVAL_SEC * C.SIM_FPS);
  sim.state.invincibleFrames = 999; // 이 스텝에서 의도치 않은 히트 방지
  sim.step();
  expect(sim.state.events & C.EV_FEVER_START).toBeTruthy();
  // 피버·유예 소진 — 이후 데미지 경로만 검증
  sim.state.feverFramesLeft = 0;
  sim.state.feverGraceFramesLeft = 0;
  sim.state.invincibleFrames = 0;
}

describe('GameSim — 초심자 보호: 첫 피버 전 히트 HP 용서 (1.18.0)', () => {
  test('첫 피버 전 충돌: EV_HIT_FORGIVEN + HP 유지', () => {
    const sim = new GameSim(1);
    placeHitObstacle(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.events & C.EV_HIT_FORGIVEN).toBeTruthy();
    // 자연 드레인만 — HIT_DAMAGE 없음
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
    expect(sim.state.invincibleFrames).toBeGreaterThan(0);
  });

  test('첫 피버 전 두 번째 충돌도 HIT_DAMAGE 없음', () => {
    const sim = new GameSim(1);
    placeHitObstacle(sim);
    sim.step(); // 첫 히트 용서
    sim.state.invincibleFrames = 0;
    placeHitObstacle(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.events & C.EV_HIT_FORGIVEN).toBeTruthy();
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });

  test('첫 피버 이후 충돌: 용서 없이 데미지', () => {
    const sim = new GameSim(1);
    forceFeverOnce(sim);
    placeHitObstacle(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.events & C.EV_HIT_FORGIVEN).toBeFalsy();
    expect(sim.state.hp).toBeCloseTo(
      hpBefore - C.HIT_DAMAGE - C.HP_DRAIN_PER_SEC * C.DT,
      5,
    );
  });

  test('피버 전 보호 히트는 콤보·피버타이머를 유지한다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 5;
    sim.state.feverTimerFrames = 40;
    placeHitObstacle(sim);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.events & C.EV_HIT_FORGIVEN).toBeTruthy();
    expect(sim.state.events & C.EV_COMBO_BREAK).toBeFalsy();
    expect(sim.state.combo).toBe(5);
    // step 중 타이머 +1은 정상, 피격으로 0 리셋되지 않으면 됨
    expect(sim.state.feverTimerFrames).toBe(41);
  });
});
