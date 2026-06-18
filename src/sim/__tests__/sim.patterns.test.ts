// TDD RED: 장애물 패턴 라이브러리 (SIM_VERSION 1.1.0)
// ObstacleState.w, OBS_PATTERNS, 충돌/니어미스 per-obstacle 폭 사용 검증
import { describe, test, expect } from 'vitest';
import { GameSim, OBS_PATTERNS, OBS_PATTERN_H_RANDOM } from '../sim';
import * as C from '../constants';

describe('GameSim — 장애물 패턴 라이브러리 (1.1.0)', () => {
  test('ObstacleState에 w 필드가 있고 기본값은 OBS_W', () => {
    const sim = new GameSim(1);
    const obs = sim.state.obstacles[0]!;
    expect(typeof obs.w).toBe('number');
    expect(obs.w).toBe(C.OBS_W);
  });

  test('OBS_PATTERNS에 5개 패턴이 정의돼 있다', () => {
    expect(Array.isArray(OBS_PATTERNS)).toBe(true);
    expect(OBS_PATTERNS.length).toBe(5);
  });

  test('SINGLE 패턴(0번) — 장애물 1개, h = OBS_PATTERN_H_RANDOM, w = OBS_W', () => {
    const single = OBS_PATTERNS[0]!;
    expect(single.length).toBe(1);
    expect(single[0]!.h).toBe(OBS_PATTERN_H_RANDOM);
    expect(single[0]!.w).toBe(C.OBS_W);
    expect(single[0]!.xOff).toBe(0);
  });

  test('TALL 패턴(1번) — h > OBS_H_MAX, 장애물 1개', () => {
    const tall = OBS_PATTERNS[1]!;
    expect(tall.length).toBe(1);
    expect(tall[0]!.h).toBeGreaterThan(C.OBS_H_MAX);
    expect(tall[0]!.w).toBe(C.OBS_W);
  });

  test('WIDE 패턴(2번) — w > OBS_W, 장애물 1개', () => {
    const wide = OBS_PATTERNS[2]!;
    expect(wide.length).toBe(1);
    expect(wide[0]!.w).toBeGreaterThan(C.OBS_W);
  });

  test('BURST 패턴(3번) — 장애물 2개, xOff 간격 90', () => {
    const burst = OBS_PATTERNS[3]!;
    expect(burst.length).toBe(2);
    expect(burst[0]!.xOff).toBe(0);
    expect(burst[1]!.xOff).toBe(90);
  });

  test('STAIRCASE 패턴(4번) — 장애물 3개, 높이 오름차순, xOff 간격 90', () => {
    const stair = OBS_PATTERNS[4]!;
    expect(stair.length).toBe(3);
    expect(stair[0]!.h).toBeLessThan(stair[1]!.h);
    expect(stair[1]!.h).toBeLessThan(stair[2]!.h);
    expect(stair[1]!.xOff).toBe(90);
    expect(stair[2]!.xOff).toBe(180);
  });

  test('모든 패턴 h(고정값) ≤ PLAYER_Y_MAX — 클리어 가능', () => {
    for (const pattern of OBS_PATTERNS) {
      for (const spec of pattern) {
        if (spec.h !== OBS_PATTERN_H_RANDOM) {
          expect(spec.h).toBeLessThanOrEqual(C.PLAYER_Y_MAX);
        }
      }
    }
  });

  test('충돌 판정이 o.w를 사용 — 넓은 장애물(w=200)은 100px 거리에서 히트', () => {
    // old code: (PLAYER_W + OBS_W)/2 = (40+28)/2 = 34 < 100 → 충돌 없음 → FAIL
    // new code: (PLAYER_W + 200)/2 = 120 > 100 → 충돌 → PASS
    const sim = new GameSim(1);
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.w = 200;
    obs.x = C.PLAYER_X + 100;
    sim.state.invincibleFrames = 0;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    sim.state.player.y = 0;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeTruthy();
  });

  test('충돌 판정이 o.w를 사용 — 좁은 장애물(w=1)은 25px 거리에서 미스', () => {
    // 1스텝 후 gap≈27. old: (PLAYER_W+OBS_W)/2=30 > 27 → 충돌 → FAIL
    // new: (PLAYER_W+1)/2=15.5 < 27 → 미스 → PASS
    const sim = new GameSim(1);
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.w = 1;
    obs.x = C.PLAYER_X + 32; // 이동 후에도 threshold(20.5)보다 충분히 멀어야 함
    sim.state.invincibleFrames = 0;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    sim.state.player.y = 0;
    sim.step();
    expect(sim.state.events & C.EV_HIT).toBeFalsy();
  });

  test('니어미스 평가가 o.w를 사용 — 넓은 장애물(w=200)은 완전 통과 전 scored=false', () => {
    // obs.x=80, 스텝 후 ≈75. playerLeft=PLAYER_X-PLAYER_W/2=173-15=158
    // old code: 75+OBS_W/2=75+14=89 < 124 → scored=true → FAIL
    // new code: 75+200/2=75+100=175 > 124 → scored=false → PASS
    const sim = new GameSim(1);
    sim.state.player.y = 200;
    sim.state.player.vy = 0;
    sim.state.invincibleFrames = 999;
    sim.state.feverFramesLeft = 0;
    sim.state.feverGraceFramesLeft = 0;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.w = 200;
    obs.x = 80;
    sim.step();
    expect(obs.scored).toBe(false);
  });

  test('결정론 — 같은 시드면 패턴 포함 동일 상태', () => {
    const a = new GameSim(42);
    const b = new GameSim(42);
    for (let i = 0; i < 1500; i++) {
      if (i % 35 === 0) { a.queueTap(); b.queueTap(); }
      a.step(); b.step();
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  test('풀 오버플로 없음 — 3000프레임 후 active ≤ MAX_OBSTACLES', () => {
    const sim = new GameSim(1);
    sim.state.invincibleFrames = 9999;
    for (let i = 0; i < 3000; i++) sim.step();
    const active = sim.state.obstacles.filter(o => o.active).length;
    expect(active).toBeLessThanOrEqual(C.MAX_OBSTACLES);
  });
});
