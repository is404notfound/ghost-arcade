// T2/T3/T9: telemetry 파생 함수(deriveDeathCause, createNearMissTracker) 단위 테스트.
// 가장 중요한 것은 회귀 테스트: 피버-유예 중 겹친 채로 드레인死하는 경우가
// EV_HIT 없이도 'collision'으로 오표기되지 않는지 확인하는 것 (design doc F4).
import { describe, test, expect } from 'vitest';
import { GameSim, collidesPlayer, type SimState } from '../../sim/sim';
import * as C from '../../sim/constants';
import { deriveDeathCause, createNearMissTracker, NEAR_MISS_THRESHOLD_PX } from '../derive';

describe('deriveDeathCause', () => {
  test('EV_HIT가 있으면 collision + 충돌한 장애물의 높이를 보고한다', () => {
    const sim = new GameSim(1);
    sim.state.player.y = 0;
    sim.state.speed = 400;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.x = C.PLAYER_X;
    obs.h = 60;
    obs.w = C.OBS_W;
    obs.scored = false;

    const result = deriveDeathCause(sim.state, C.EV_HIT);

    expect(result.death_cause).toBe('collision');
    expect(result.death_obstacle_height).toBe(60);
    expect(result.speed_at_death).toBe(400);
  });

  test('EV_HIT가 없으면 (순수 드레인死) hp_drain + 높이 null', () => {
    const sim = new GameSim(1);
    sim.state.speed = 300;

    const result = deriveDeathCause(sim.state, C.EV_GAME_OVER); // EV_HIT 미포함

    expect(result.death_cause).toBe('hp_drain');
    expect(result.death_obstacle_height).toBeNull();
    expect(result.speed_at_death).toBe(300);
  });

  test('회귀: 장애물과 겹쳐 있어도(collidesPlayer=true) EV_HIT가 없으면 절대 collision으로 표기하지 않는다 (피버-유예 드레인死 시뮬레이션)', () => {
    const sim = new GameSim(1);
    sim.state.player.y = 0;
    sim.state.speed = 200;
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.x = C.PLAYER_X;
    obs.h = 60;
    obs.w = C.OBS_W;
    obs.scored = false;

    // 사전 조건 확인: 실제로 겹쳐 있다 (피버-유예 중이라면 sim의 충돌 루프는 건너뛰지만
    // overlap 자체는 여전히 참일 수 있다는 grounding을 그대로 재현)
    expect(collidesPlayer(C.PLAYER_X, sim.state.player.y, obs)).toBe(true);

    // EV_HIT 없이 EV_GAME_OVER만 발화한 프레임 (= 유예 중 드레인死)
    const result = deriveDeathCause(sim.state, C.EV_GAME_OVER);

    expect(result.death_cause).toBe('hp_drain');
    expect(result.death_obstacle_height).toBeNull();
  });
});

describe('createNearMissTracker', () => {
  function makeState(playerY: number, obstacles: Array<{ active: boolean; x: number; h: number; w: number }>): SimState {
    return {
      frame: 0,
      gameOver: false,
      hp: 100,
      distance: 0,
      speed: 0,
      combo: 0,
      feverFramesLeft: 0,
      feverGraceFramesLeft: 0,
      feverTimerFrames: 0,
      invincibleFrames: 0,
      player: { y: playerY, vy: 0, jumpsUsed: 0 },
      obstacles: obstacles.map((o) => ({ ...o, scored: false })),
      potions: [],
      events: 0,
    };
  }

  test('여유(player.y - o.h)가 [0, threshold) 안이면 통과 시 카운트가 1 증가한다', () => {
    const tracker = createNearMissTracker();
    // 겹침 중 여유 15 → 10으로 갱신 (러닝 최소)
    tracker.onStep(makeState(75, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }]));
    tracker.onStep(makeState(70, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }]));
    // x가 멀어져 overlap 종료 = 통과. 최소 여유 10 < NEAR_MISS_THRESHOLD_PX(20) → 니어미스
    tracker.onStep(makeState(70, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }]));

    expect(tracker.count()).toBe(1);
  });

  test('여유가 threshold 이상이면 통과해도 카운트되지 않는다', () => {
    const tracker = createNearMissTracker();
    tracker.onStep(makeState(85, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }])); // 여유 25 >= 20
    tracker.onStep(makeState(85, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }])); // 통과

    expect(tracker.count()).toBe(0);
  });

  test('여유가 음수(실제 충돌)면 니어미스로 카운트되지 않는다', () => {
    const tracker = createNearMissTracker();
    tracker.onStep(makeState(50, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }])); // 여유 -10 (충돌)
    tracker.onStep(makeState(50, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }])); // 통과

    expect(tracker.count()).toBe(0);
  });

  test('스폰 전이(inactive→active) 시 러닝 최소값이 리셋되어 이전 점유자의 값이 새지 않는다', () => {
    const tracker = createNearMissTracker();
    // 1번째 장애물: 니어미스급 여유(10)로 통과 → count=1
    tracker.onStep(makeState(70, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }]));
    tracker.onStep(makeState(70, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }]));
    expect(tracker.count()).toBe(1);

    // 슬롯 비활성화 (despawn) 후 같은 슬롯에 새 장애물 스폰 — 넉넉한 여유(50)로 통과해야 함
    tracker.onStep(makeState(70, [{ active: false, x: 0, h: 0, w: C.OBS_W }]));
    tracker.onStep(makeState(150, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }])); // 여유 90
    tracker.onStep(makeState(150, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }])); // 통과

    // 리셋이 안 됐다면 이전 최소값(10)이 새어 잘못 카운트될 것 — 리셋됐다면 그대로 1
    expect(tracker.count()).toBe(1);
  });

  test('결정론: 동일한 장애물-상태 시퀀스는 onStep 호출이 어떤 그룹/타이밍으로 나뉘어도 최종 카운트가 같다', () => {
    // 슬롯 0 하나로 여러 "생애"(니어미스 1회, 충돌 1회 무시, 여유통과 1회 무시)를 구성
    const states: SimState[] = [
      makeState(75, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }]), // 여유 15
      makeState(70, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }]), // 여유 10 (최소)
      makeState(70, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }]), // 통과 → +1
      makeState(70, [{ active: false, x: 0, h: 0, w: C.OBS_W }]), // despawn
      makeState(50, [{ active: true, x: C.PLAYER_X, h: 80, w: C.OBS_W }]), // 여유 -30 (충돌)
      makeState(50, [{ active: true, x: C.PLAYER_X + 500, h: 80, w: C.OBS_W }]), // 통과 → 카운트 안 됨
      makeState(50, [{ active: false, x: 0, h: 0, w: C.OBS_W }]), // despawn
      makeState(120, [{ active: true, x: C.PLAYER_X, h: 60, w: C.OBS_W }]), // 여유 60 (여유 통과)
      makeState(120, [{ active: true, x: C.PLAYER_X + 500, h: 60, w: C.OBS_W }]), // 통과 → 카운트 안 됨
    ];

    function feedInGroups(tracker: ReturnType<typeof createNearMissTracker>, groupSizes: number[]): void {
      let idx = 0;
      for (const size of groupSizes) {
        for (let k = 0; k < size && idx < states.length; k++, idx++) {
          tracker.onStep(states[idx]!);
        }
      }
    }

    const trackerFixedStep = createNearMissTracker();
    feedInGroups(trackerFixedStep, states.map(() => 1)); // 매 스텝마다 1회 — 이상적인 고정스텝 호출

    // 다른 "기기"가 렌더 프레임당 서로 다른 개수의 고정스텝을 몰아서 처리했다고 가정 —
    // 그래도 매 고정스텝마다 정확히 한 번 onStep이 불리는 한(그룹 경계만 다름) 결과는 같아야 한다.
    const trackerVariableFps = createNearMissTracker();
    feedInGroups(trackerVariableFps, [3, 1, 4, 1]); // 합계 9 = states.length, 임의의 배치 크기

    expect(trackerFixedStep.count()).toBe(trackerVariableFps.count());
    expect(trackerFixedStep.count()).toBe(1);
  });

  test('NEAR_MISS_THRESHOLD_PX는 양수 placeholder 상수다 (골든 리플레이 튜닝 전 임시값)', () => {
    expect(NEAR_MISS_THRESHOLD_PX).toBeGreaterThan(0);
  });
});
