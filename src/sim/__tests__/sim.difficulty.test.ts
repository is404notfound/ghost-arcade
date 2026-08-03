// TDD RED: MAX_JUMPS=2, 온보딩 난이도 램프 (SIM_VERSION 1.4.0)
import { describe, test, expect } from 'vitest';
import { GameSim, OBS_PATTERNS, OBS_PATTERN_H_RANDOM } from '../sim';
import * as C from '../constants';

// ──────────────────────────────────────────────────────────
// 2단 점프
// ──────────────────────────────────────────────────────────
describe('GameSim — 2단 점프 (MAX_JUMPS=2)', () => {
  test('MAX_JUMPS는 2이다', () => {
    expect(C.MAX_JUMPS).toBe(2);
  });

  test('지상에서 점프하고 공중에서 1번 더 점프할 수 있다 (총 2단)', () => {
    const sim = new GameSim(1);
    // 1단: 지상
    sim.queueTap();
    sim.step();
    expect(sim.state.events & C.EV_JUMP).toBeTruthy();
    expect(sim.state.player.jumpsUsed).toBe(1);
    for (let i = 0; i < 3; i++) sim.step(); // 공중 유지
    // 2단: 공중
    sim.queueTap();
    sim.step();
    expect(sim.state.events & C.EV_JUMP).toBeTruthy();
    expect(sim.state.player.jumpsUsed).toBe(2);
  });

  test('공중에서 3번째 점프는 무시된다', () => {
    const sim = new GameSim(1);
    // 1단
    sim.queueTap();
    sim.step();
    for (let i = 0; i < 3; i++) sim.step();
    // 2단
    sim.queueTap();
    sim.step();
    for (let i = 0; i < 3; i++) sim.step();
    // 3단 시도 — 무시됨
    const vyBefore = sim.state.player.vy;
    sim.queueTap();
    sim.step();
    expect(sim.state.events & C.EV_JUMP).toBeFalsy();
    expect(sim.state.player.vy).toBeCloseTo(vyBefore - C.GRAVITY * C.DT, 5);
  });
});

// ──────────────────────────────────────────────────────────
// 클리어 가능성 — 모든 장애물이 2단 점프로 통과 가능해야 함
// ──────────────────────────────────────────────────────────
describe('GameSim — 클리어 가능성 (2단 점프 기준)', () => {
  test('TALL 패턴의 h는 OBS_H_MAX보다 크다 (SINGLE 랜덤 높이와 구분)', () => {
    // TALL이 식별 가능해야 early-game exclusion 테스트가 의미 있다
    const tallH = OBS_PATTERNS[1]![0]!.h;
    expect(tallH).toBeGreaterThan(C.OBS_H_MAX);
  });

  test('OBS_H_MAX는 2단 점프 도달 높이 이하이다', () => {
    const singleApex = (C.JUMP_VEL * C.JUMP_VEL) / (2 * C.GRAVITY);
    const doubleApex = 2 * singleApex; // ≈ 330
    expect(C.OBS_H_MAX).toBeLessThanOrEqual(Math.floor(doubleApex));
  });

  test('모든 패턴 고정 높이가 2단 점프 도달 높이 이하이다', () => {
    const singleApex = (C.JUMP_VEL * C.JUMP_VEL) / (2 * C.GRAVITY);
    const doubleApex = 2 * singleApex;
    for (const pattern of OBS_PATTERNS) {
      for (const spec of pattern) {
        if (spec.h !== OBS_PATTERN_H_RANDOM) {
          expect(spec.h).toBeLessThanOrEqual(Math.floor(doubleApex));
        }
      }
    }
  });
});

// ──────────────────────────────────────────────────────────
// 온보딩 난이도 램프
// ──────────────────────────────────────────────────────────
describe('GameSim — 온보딩 난이도 램프', () => {
  test('PATTERN_RAMP_SEC 상수가 양수로 정의돼 있다', () => {
    expect(typeof C.PATTERN_RAMP_SEC).toBe('number');
    expect(C.PATTERN_RAMP_SEC).toBeGreaterThan(0);
  });

  test('PATTERN_FULL_SEC는 PATTERN_RAMP_SEC보다 크다', () => {
    expect(C.PATTERN_FULL_SEC).toBeGreaterThan(C.PATTERN_RAMP_SEC);
  });

  test('초반(PATTERN_RAMP_SEC 이전)에는 TALL 장애물이 스폰되지 않는다', () => {
    // TALL의 h는 OBS_H_MAX보다 크므로 SINGLE 랜덤 높이와 겹치지 않음
    const tallH = OBS_PATTERNS[1]![0]!.h;
    const earlyFrames = Math.ceil(C.PATTERN_RAMP_SEC * C.SIM_FPS);
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new GameSim(seed);
      // 피격 방지. HP 드레인은 19초에 76HP(HP_MAX=100)라 온보딩 구간 내 게임오버 없음.
      sim.state.invincibleFrames = 9999;
      for (let f = 0; f < earlyFrames; f++) {
        sim.step();
        for (const o of sim.state.obstacles) {
          if (o.active) {
            expect(o.h).not.toBe(tallH);
          }
        }
      }
    }
  });
});

// ──────────────────────────────────────────────────────────
// 온보딩 구간 (1.16.0) — 첫 300m를 넘겨 피버 1회 경험
// ──────────────────────────────────────────────────────────
describe('GameSim — 온보딩 구간 (첫 300m 완화)', () => {
  test('ONBOARD_SEC는 300m 도달 시각(≈18.7초)을 덮는다', () => {
    // 9000유닛(=300m) = SPEED_BASE·t + (SPEED_RAMP/2)·t²  (SPEED_MAX 도달 전 구간)
    const a = C.SPEED_RAMP / 2;
    const b = C.SPEED_BASE;
    const c = -300 * C.UNITS_PER_METER;
    const t300 = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    expect(t300).toBeLessThanOrEqual(C.ONBOARD_SEC);
  });

  test('ONBOARD_SEC는 피버 발동 시간(FEVER_INTERVAL_SEC)보다 길다', () => {
    // 온보딩을 끝까지 살아남으면 콤보 유지 시 피버를 최소 1회 경험한다
    expect(C.ONBOARD_SEC).toBeGreaterThan(C.FEVER_INTERVAL_SEC);
  });

  test('ONBOARD_OBS_H_MAX는 평시 상한(OBS_H_MAX)보다 낮다', () => {
    expect(C.ONBOARD_OBS_H_MAX).toBeLessThan(C.OBS_H_MAX);
    expect(C.ONBOARD_OBS_H_MAX).toBeGreaterThanOrEqual(C.OBS_H_MIN);
  });

  test('온보딩 구간의 모든 활성 장애물은 ONBOARD_OBS_H_MAX 이하다', () => {
    const onboardFrames = Math.ceil(C.ONBOARD_SEC * C.SIM_FPS);
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new GameSim(seed);
      sim.state.invincibleFrames = 9999; // 피격 방지 (위 테스트와 동일 근거)
      for (let f = 0; f < onboardFrames; f++) {
        sim.step();
        for (const o of sim.state.obstacles) {
          if (o.active) {
            expect(o.h).toBeLessThanOrEqual(C.ONBOARD_OBS_H_MAX);
          }
        }
      }
    }
  });

  test('온보딩 이후에는 평시 상한(OBS_H_MAX)까지 다시 나온다', () => {
    // 클램프가 온보딩 구간에만 걸리는지 확인 — 영구 하향이 아님
    const afterFrames = Math.ceil((C.PATTERN_FULL_SEC + 40) * C.SIM_FPS);
    let sawAboveOnboardCap = false;
    for (let seed = 1; seed <= 20 && !sawAboveOnboardCap; seed++) {
      const sim = new GameSim(seed);
      sim.state.invincibleFrames = 9999;
      for (let f = 0; f < afterFrames; f++) {
        sim.step();
        if (sim.state.gameOver) break;
        for (const o of sim.state.obstacles) {
          if (o.active && o.h > C.ONBOARD_OBS_H_MAX) sawAboveOnboardCap = true;
        }
      }
    }
    expect(sawAboveOnboardCap).toBe(true);
  });
});
