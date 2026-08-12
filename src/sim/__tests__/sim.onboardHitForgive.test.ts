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

describe('GameSim — 온보딩 첫 히트 용서 (1.17.0)', () => {
  test('ONBOARD_SEC 안 첫 충돌: EV_HIT는 나지만 HIT_DAMAGE는 없다', () => {
    const sim = new GameSim(1);
    expect(sim.state.frame * C.DT).toBeLessThan(C.ONBOARD_SEC);
    placeHitObstacle(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    // 자연 드레인만 — HIT_DAMAGE 없음
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
    expect(sim.state.invincibleFrames).toBeGreaterThan(0);
  });

  test('온보딩 중 두 번째 충돌: HIT_DAMAGE 적용', () => {
    const sim = new GameSim(1);
    placeHitObstacle(sim);
    sim.step(); // 첫 히트 용서 소비
    // 무적 종료 후 재충돌
    sim.state.invincibleFrames = 0;
    placeHitObstacle(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.hp).toBeCloseTo(
      hpBefore - C.HIT_DAMAGE - C.HP_DRAIN_PER_SEC * C.DT,
      5,
    );
  });

  test('ONBOARD_SEC 이후 첫 충돌: 용서 없이 데미지', () => {
    const sim = new GameSim(1);
    const onboardFrames = Math.ceil(C.ONBOARD_SEC * C.SIM_FPS);
    sim.state.frame = onboardFrames;
    sim.state.invincibleFrames = 999; // 프레임만 진행할 때 의도치 않은 히트 방지
    // frame을 직접 올린 뒤 한 스텝에서 충돌
    sim.state.invincibleFrames = 0;
    placeHitObstacle(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.hp).toBeCloseTo(
      hpBefore - C.HIT_DAMAGE - C.HP_DRAIN_PER_SEC * C.DT,
      5,
    );
  });

  test('첫 히트 용서 시에도 콤보는 끊긴다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 5;
    placeHitObstacle(sim);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.events & C.EV_COMBO_BREAK).toBeTruthy();
    expect(sim.state.combo).toBe(0);
  });
});
