import { describe, test, expect } from 'vitest';
import { GameSim } from '../sim';
import * as C from '../constants';

/**
 * 장애물이 한 스텝 뒤에 scored=true 되도록 배치한다.
 * 충돌이 일어나지 않는 위치 (playerLeft 바로 직전).
 *
 * scored 조건: o.x + OBS_W/2 < PLAYER_X - PLAYER_W/2
 *   → o.x < 110 (한 스텝 이동량 ≈ 4.8 이므로 초기값 112 로 충분)
 * 충돌 조건: |o.x - PLAYER_X| < (PLAYER_W + OBS_W)/2 = 34 (사후 이동값 ≈ 107)
 *   → 사후 107 기준 |107-144| = 37 > 34 → 충돌 없음 ✓
 */
function arrangeScoring(sim: GameSim, playerY = 200): void {
  sim.state.player.y = playerY;
  sim.state.player.vy = 0;
  sim.state.player.jumpsUsed = playerY > 0 ? 1 : 0;
  const obs = sim.state.obstacles[0]!;
  obs.active = true;
  obs.h = 60;
  obs.scored = false;
  obs.x = C.PLAYER_X - C.PLAYER_W / 2 - C.OBS_W / 2 + 2; // 한 스텝 이면 완전 통과
}

/** 장애물이 플레이어와 충돌하도록 배치 */
function arrangeHit(sim: GameSim): void {
  sim.state.invincibleFrames = 0;
  sim.state.player.y = 0;
  const obs = sim.state.obstacles[0]!;
  obs.active = true;
  obs.h = 60;
  obs.scored = false;
  obs.x = C.PLAYER_X; // 정중앙 = 겹침
}

describe('GameSim — 장애물 통과 combo', () => {
  test('초기 combo는 0이다', () => {
    const sim = new GameSim(1);
    expect(sim.state.combo).toBe(0);
  });

  test('장애물이 통과(scored)되면 combo가 1 오른다', () => {
    const sim = new GameSim(1);
    sim.state.invincibleFrames = 999; // 피격 차단
    arrangeScoring(sim);
    sim.step();
    expect(sim.state.obstacles[0]!.scored).toBe(true);
    expect(sim.state.combo).toBe(1);
  });

  test('공중이 아닐 때(지상)도 장애물 통과 시 combo가 오른다', () => {
    const sim = new GameSim(1);
    // 지상: y=0. 충돌 방지를 위해 무적 유지
    sim.state.invincibleFrames = 999;
    arrangeScoring(sim, 0); // playerY=0 → airborne=false
    sim.step();
    expect(sim.state.obstacles[0]!.scored).toBe(true);
    expect(sim.state.combo).toBe(1);
  });

  test('장애물 여러 개를 연속 통과하면 combo가 계속 쌓인다', () => {
    const sim = new GameSim(1);
    sim.state.invincibleFrames = 999;
    for (let pass = 0; pass < 3; pass++) {
      arrangeScoring(sim);
      sim.step();
      expect(sim.state.combo).toBe(pass + 1);
    }
  });

  test('피격(EV_HIT) 시 combo가 0으로 리셋된다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 5;
    arrangeHit(sim);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.combo).toBe(0);
  });

  test('콤보가 있을 때 피격되면 EV_COMBO_BREAK가 발화한다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 3;
    arrangeHit(sim);
    sim.step();
    expect(sim.state.events & C.EV_COMBO_BREAK).toBeTruthy();
  });

  test('combo=0일 때 피격되어도 EV_COMBO_BREAK는 발화하지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.combo = 0;
    arrangeHit(sim);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
    expect(sim.state.events & C.EV_COMBO_BREAK).toBeFalsy();
  });

  test('combo++ 프레임에서 HP는 드레인만큼만 변한다 (피드백 없음)', () => {
    const sim = new GameSim(1);
    sim.state.invincibleFrames = 999;
    arrangeScoring(sim);
    const hpBefore = sim.state.hp;
    sim.step();
    expect(sim.state.combo).toBe(1);
    // 콤보 자체는 HP에 영향 없음 — 드레인만큼만 변해야 한다
    expect(sim.state.hp).toBeCloseTo(hpBefore - C.HP_DRAIN_PER_SEC * C.DT, 5);
  });

  test('combo는 결정론에 포함된다 — 같은 시드·입력이면 같은 combo', () => {
    const a = new GameSim(111);
    const b = new GameSim(111);
    for (let i = 0; i < 1000; i++) {
      if (i % 45 === 0) {
        a.queueTap();
        b.queueTap();
      }
      a.step();
      b.step();
    }
    expect(a.state.combo).toBe(b.state.combo);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
