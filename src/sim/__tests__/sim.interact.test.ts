import { describe, test, expect } from 'vitest';
import { GameSim, replay } from '../sim';
import * as C from '../constants';
import { createInputLog, recordTap, serializeLog, parseLog } from '../inputLog';

/** EV 비트가 켜질 때까지 진행. 발생 프레임 반환, 못 찾으면 -1 */
function stepUntilEvent(sim: GameSim, ev: number, maxSteps: number): number {
  for (let i = 0; i < maxSteps; i++) {
    sim.step();
    if (sim.state.events & ev) return sim.state.frame;
  }
  return -1;
}

describe('GameSim — 충돌과 무적', () => {
  test('장애물과 충돌하면 HIT_DAMAGE만큼 깎이고 EV_HIT가 발생한다', () => {
    const sim = new GameSim(1);
    const hitFrame = stepUntilEvent(sim, C.EV_HIT, 600); // 입력 없으면 첫 장애물에 반드시 맞음
    expect(hitFrame).toBeGreaterThan(0);
    const drained = C.HP_DRAIN_PER_SEC * hitFrame * C.DT;
    expect(sim.state.hp).toBeCloseTo(C.HP_MAX - drained - C.HIT_DAMAGE, 3);
  });

  test('무적 시간 내에는 연속 피격되지 않는다', () => {
    const sim = new GameSim(1);
    const hitFrames: number[] = [];
    for (let i = 0; i < 1200 && !sim.state.gameOver; i++) {
      sim.step();
      if (sim.state.events & C.EV_HIT) hitFrames.push(sim.state.frame);
    }
    expect(hitFrames.length).toBeGreaterThanOrEqual(2);
    const invincibleFrames = Math.round((C.INVINCIBLE_MS / 1000) * C.SIM_FPS);
    for (let i = 1; i < hitFrames.length; i++) {
      expect(hitFrames[i]! - hitFrames[i - 1]!).toBeGreaterThanOrEqual(invincibleFrames);
    }
  });
});

describe('GameSim — 체력포션', () => {
  test('포션은 시간이 지나면 스폰되고 점프 높이 범위에 등장한다', () => {
    const sim = new GameSim(5);
    sim.state.hp = 1e9;
    let found = false;
    for (let i = 0; i < 5000 && !found; i++) {
      sim.step();
      for (const p of sim.state.potions) {
        if (p.active) {
          found = true;
          expect(p.y).toBeGreaterThanOrEqual(C.POTION_Y_MIN);
          expect(p.y).toBeLessThanOrEqual(C.POTION_Y_MAX);
        }
      }
    }
    expect(found).toBe(true);
  });

  test('포션에 닿으면 회복하고 포션은 비활성화된다', () => {
    const sim = new GameSim(1);
    sim.state.hp = 50;
    // 공중의 플레이어 경로에 포션을 직접 배치 (상태는 순수 데이터 — 테스트가 직접 arrange)
    sim.state.player.y = 100;
    sim.state.player.vy = 0;
    sim.state.player.jumpsUsed = 1;
    const potion = sim.state.potions[0]!;
    potion.active = true;
    potion.x = C.PLAYER_X;
    potion.y = 120;
    sim.step();
    expect(sim.state.events & C.EV_POTION).toBeTruthy();
    expect(potion.active).toBe(false);
    expect(sim.state.hp).toBeCloseTo(50 + C.POTION_HEAL - C.HP_DRAIN_PER_SEC * C.DT, 3);
  });

  test('회복은 HP_MAX를 넘지 않는다', () => {
    const sim = new GameSim(1);
    sim.state.player.y = 100;
    sim.state.player.jumpsUsed = 1;
    const potion = sim.state.potions[0]!;
    potion.active = true;
    potion.x = C.PLAYER_X;
    potion.y = 120;
    sim.step(); // hp는 HP_MAX 근처에서 시작
    expect(sim.state.hp).toBeLessThanOrEqual(C.HP_MAX);
  });
});

describe('GameSim — 니어미스', () => {
  function arrangeNearMiss(sim: GameSim, gapAboveTop: number): void {
    // 장애물이 플레이어를 '막 완전히 통과'하기 직전 상태를 만든다
    const obs = sim.state.obstacles[0]!;
    obs.active = true;
    obs.h = 60;
    obs.scored = false;
    obs.x = C.PLAYER_X - (C.PLAYER_W + C.OBS_W) / 2 + 2; // 한 스텝이면 완전 통과
    sim.state.player.y = obs.h + gapAboveTop;
    sim.state.player.vy = 300; // 상승 중 (공중 유지)
    sim.state.player.jumpsUsed = 1;
  }

  test('아슬아슬하게 넘으면 콤보가 오르고 체력 보너스를 받는다', () => {
    const sim = new GameSim(1);
    sim.state.hp = 50;
    arrangeNearMiss(sim, 20); // 윗면에서 20 — NEAR_MISS_UNITS(52) 이내
    sim.step();
    expect(sim.state.events & C.EV_NEAR_MISS).toBeTruthy();
    expect(sim.state.nearMissCombo).toBe(1);
    expect(sim.state.hp).toBeCloseTo(50 + C.NEAR_MISS_HEAL - C.HP_DRAIN_PER_SEC * C.DT, 3);
  });

  test('넉넉하게 넘으면 콤보가 리셋된다', () => {
    const sim = new GameSim(1);
    sim.state.nearMissCombo = 3;
    arrangeNearMiss(sim, C.NEAR_MISS_UNITS + 40); // 한참 위로 통과
    sim.step();
    expect(sim.state.events & C.EV_NEAR_MISS).toBeFalsy();
    expect(sim.state.nearMissCombo).toBe(0);
  });
});

describe('GameSim — 결정론과 리플레이', () => {
  test('같은 시드 + 같은 입력 = 완전히 같은 상태 (2000스텝)', () => {
    const a = new GameSim(424242);
    const b = new GameSim(424242);
    for (let f = 0; f < 2000; f++) {
      if (f % 50 === 0) {
        a.queueTap();
        b.queueTap();
      }
      a.step();
      b.step();
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  test('입력 로그 기록 → 직렬화 → 재생이 원본과 같은 최종 상태를 만든다', () => {
    const seed = 777;
    const original = new GameSim(seed);
    const log = createInputLog(seed);
    const totalFrames = 1500;
    for (let f = 0; f < totalFrames; f++) {
      // 의사-불규칙 탭 스케줄 (테스트 자체도 결정론적이어야 함)
      if ((f * 7919) % 97 < 3) {
        recordTap(log, original.state.frame);
        original.queueTap();
      }
      original.step();
    }

    const restored = parseLog(serializeLog(log));
    const replayed = replay(restored, totalFrames);
    expect(JSON.stringify(replayed.state)).toBe(JSON.stringify(original.state));
  });

  test('다른 시드는 다른 코스를 만든다', () => {
    const a = new GameSim(1);
    const b = new GameSim(2);
    const stepBoth = (n: number) => {
      for (let i = 0; i < n; i++) {
        a.step();
        b.step();
      }
    };
    // 500프레임(~6스폰) 실행 — 다른 시드는 거리·콤보·장애물 위치 등이 달라짐
    stepBoth(500);
    // 전체 state 비교: 패턴 우연 일치를 피하기 위해 장애물 높이만이 아닌 전체로 비교
    expect(JSON.stringify(a.state)).not.toBe(JSON.stringify(b.state));
  });
});
