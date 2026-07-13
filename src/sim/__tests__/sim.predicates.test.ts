// T1/T9: 순수 오버랩 술어(overlapsPlayerX/collidesPlayer)가 sim 자신의 충돌 루프와
// 항상 같은 결과를 내는지 검증하는 핀 테스트. 이 술어들이 sim의 충돌 판정 자체가
// 위임하는 단일 소스이므로, 여기서 어긋나면 sim의 충돌 판정 자체가 깨진 것과 같다.
import { describe, test, expect } from 'vitest';
import { GameSim, overlapsPlayerX, collidesPlayer } from '../sim';
import * as C from '../constants';

describe('overlapsPlayerX / collidesPlayer — 순수 술어', () => {
  test('x가 정확히 겹치고 낮은 장애물 = 충돌', () => {
    const obs = { x: C.PLAYER_X, w: C.OBS_W, h: 60 };
    expect(overlapsPlayerX(C.PLAYER_X, obs)).toBe(true);
    expect(collidesPlayer(C.PLAYER_X, 0, obs)).toBe(true);
  });

  test('플레이어가 장애물보다 높이 떠 있으면 x가 겹쳐도 충돌 아님', () => {
    const obs = { x: C.PLAYER_X, w: C.OBS_W, h: 60 };
    expect(overlapsPlayerX(C.PLAYER_X, obs)).toBe(true);
    expect(collidesPlayer(C.PLAYER_X, 61, obs)).toBe(false);
  });

  test('x가 충분히 멀면 겹침도 충돌도 아님', () => {
    const obs = { x: C.PLAYER_X + 1000, w: C.OBS_W, h: 60 };
    expect(overlapsPlayerX(C.PLAYER_X, obs)).toBe(false);
    expect(collidesPlayer(C.PLAYER_X, 0, obs)).toBe(false);
  });

  test('경계값: (PLAYER_W + o.w)/2 정확히 그 지점은 겹침 아님 (엄격 부등호)', () => {
    const w = C.OBS_W;
    const boundary = (C.PLAYER_W + w) / 2;
    const obs = { x: C.PLAYER_X + boundary, w, h: 60 };
    expect(overlapsPlayerX(C.PLAYER_X, obs)).toBe(false);
  });

  test('수동 배치: 겹치는 낮은 장애물 → 술어가 true를 예측하고 sim도 실제로 EV_HIT를 발화', () => {
    const sim = new GameSim(1);
    sim.state.player.y = 0;
    sim.state.invincibleFrames = 0;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.x = C.PLAYER_X;
    obs.h = 60;
    obs.w = C.OBS_W;
    obs.scored = false;
    expect(collidesPlayer(C.PLAYER_X, sim.state.player.y, obs)).toBe(true);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
  });

  test('수동 배치: 장애물보다 높이 뜬 플레이어 → 술어가 false를 예측하고 sim도 EV_HIT 미발화', () => {
    const sim = new GameSim(1);
    sim.state.player.y = 200; // o.h(60)보다 훨씬 높음
    sim.state.player.vy = 0;
    sim.state.invincibleFrames = 0;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.x = C.PLAYER_X;
    obs.h = 60;
    obs.w = C.OBS_W;
    obs.scored = false;
    expect(collidesPlayer(C.PLAYER_X, sim.state.player.y, obs)).toBe(false);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeFalsy();
  });

  test('수동 배치: x가 멀리 떨어진 장애물 → 술어가 false를 예측하고 sim도 EV_HIT 미발화', () => {
    const sim = new GameSim(1);
    sim.state.player.y = 0;
    sim.state.invincibleFrames = 0;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.x = C.PLAYER_X + 500;
    obs.h = 60;
    obs.w = C.OBS_W;
    obs.scored = false;
    expect(collidesPlayer(C.PLAYER_X, sim.state.player.y, obs)).toBe(false);
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeFalsy();
  });
});
