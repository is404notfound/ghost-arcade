// 결정론 시뮬레이션 코어 (D1/D6/D10).
//
//   입력(탭) ──queueTap()──► [GameSim] ──step()──► state (렌더는 읽기만)
//                              │
//                              └─ 시드 RNG + 고정 dt + 사칙연산만
//                                 → 같은 (시드, 입력로그)면 어느 엔진에서나 같은 결과
//
// 제약 (PLAN.md 설계 제약):
// - step() 내 객체 할당 금지 — 모든 상태는 생성자에서 만들고 재사용 (D6)
// - Math는 sqrt/floor/min/max만 — 초월함수·random 금지, ESLint가 강제 (D10)
// - 시간은 frame 인덱스로만 — 벽시계 금지
import { Rng } from './rng';
import * as C from './constants';
import type { InputLog } from './inputLog';

export interface PlayerState {
  y: number; // 바닥 기준 높이 (지면 = 0, 위가 양수)
  vy: number;
  jumpsUsed: number;
}

export interface ObstacleState {
  active: boolean;
  x: number; // 중심 x
  h: number; // 높이 (바닥에서 윗면까지)
  w: number; // 폭 (per-obstacle — 패턴마다 다를 수 있음)
  scored: boolean; // 니어미스 평가 완료 여부
}

/** 패턴 내 장애물 스펙 */
export interface ObsSpec {
  readonly h: number;    // 높이 (OBS_PATTERN_H_RANDOM이면 스폰 시 랜덤 롤)
  readonly w: number;    // 폭
  readonly xOff: number; // SPAWN_X 기준 오프셋 (0 = 화면 오른쪽 경계)
}

// h 롤 결과로 대체할 sentinel 값
export const OBS_PATTERN_H_RANDOM = -1;

// 스폰 1회 = 패턴 1개. 배열 인덱스가 패턴 ID.
// RNG 소비 순서: (1)패턴ID → (2)랜덤높이 → (3)포션여부 → (4)포션Y(조건부)
export const OBS_PATTERNS: ReadonlyArray<ReadonlyArray<ObsSpec>> = [
  // 0: SINGLE — 랜덤 높이 1개 (기존 동작)
  [{ h: OBS_PATTERN_H_RANDOM, w: C.OBS_W, xOff: 0 }],
  // 1: TALL — 싱글 점프 피크(165)에 근접, 더블 점프 권장 (h=148)
  [{ h: 148, w: C.OBS_W, xOff: 0 }],
  // 2: WIDE_LOW — 넓고 낮음, 체공 시간 필요 (h=72, w=64)
  [{ h: 72, w: 64, xOff: 0 }],
  // 3: BURST — 낮은 2개 근접 배치 (연속 점프 or 한 번에 넘기, h=60)
  [{ h: 60, w: C.OBS_W, xOff: 0 }, { h: 60, w: C.OBS_W, xOff: 90 }],
  // 4: STAIRCASE — 낮→중→높 3단 리듬 점프 (h=60/92/120)
  [{ h: 60, w: C.OBS_W, xOff: 0 }, { h: 92, w: C.OBS_W, xOff: 90 }, { h: 120, w: C.OBS_W, xOff: 180 }],
];

export interface PotionState {
  active: boolean;
  x: number; // 중심 x
  y: number; // 중심 높이
}

export interface SimState {
  frame: number;
  gameOver: boolean;
  hp: number;
  distance: number; // 미터
  speed: number; // 현재 스크롤 속도 (렌더 참조용 캐시)
  combo: number; // 장애물 통과 콤보 — 표시 전용, HP·거리·RNG에 영향 없음
  feverFramesLeft: number; // 피버 잔여 프레임 (0 = 피버 없음)
  feverGraceFramesLeft: number; // 피버 종료 후 충돌 유예 잔여 프레임 (0 = 유예 없음)
  feverTimerFrames: number; // 콤보 유지 프레임 누적 — FEVER_INTERVAL_SEC*SIM_FPS 도달 시 발동
  invincibleFrames: number; // 남은 무적 프레임 (렌더 깜빡임 참조용)
  player: PlayerState;
  obstacles: ObstacleState[]; // 고정 크기 풀 — 배열/원소 재할당 금지
  potions: PotionState[]; // 고정 크기 풀
  events: number; // 직전 step에서 발생한 이벤트 비트마스크
}

/** 현재 시각(초)의 스크롤 속도 — 에스컬레이션 + 상한 */
export function speedAtSec(t: number): number {
  return Math.min(C.SPEED_MAX, C.SPEED_BASE + t * C.SPEED_RAMP);
}

/** 현재 시각(초)의 장애물 스폰 간격(ms) — 단축 + 하한 */
export function intervalMsAtSec(t: number): number {
  return Math.max(C.INTERVAL_MIN_MS, C.INTERVAL_BASE_MS - t * C.INTERVAL_RAMP_MS);
}

function intervalFramesAtSec(t: number): number {
  return Math.max(1, Math.round((intervalMsAtSec(t) / 1000) * C.SIM_FPS));
}

export class GameSim {
  readonly state: SimState;
  private readonly rng: Rng;
  private pendingTaps = 0;
  private framesUntilSpawn: number;
  // 멀티-장애물 패턴 슬롯 버퍼 — 생성자에서 한 번 할당, spawnObstacle에서 재사용 (D6)
  private readonly spawnSlots: number[];
  // 다음 포션 스폰 예약 (-1 = 없음). 높이는 장애물 스폰 시점에 미리 굴려둔다 —
  // RNG 소비 순서를 스폰 스텝에 고정해야 어떤 인터리빙에서도 결정론이 유지된다.
  private potionInFrames = -1;
  private potionPendingY = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.spawnSlots = [0, 0, 0]; // STAIRCASE 최대 3개 슬롯 예약
    // 풀은 여기서 단 한 번 할당 — step()은 이 객체들만 재사용한다 (D6)
    const obstacles: ObstacleState[] = [];
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      obstacles.push({ active: false, x: 0, h: 0, w: C.OBS_W, scored: false });
    }
    const potions: PotionState[] = [];
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      potions.push({ active: false, x: 0, y: 0 });
    }
    this.state = {
      frame: 0,
      gameOver: false,
      hp: C.HP_MAX,
      distance: 0,
      speed: speedAtSec(0),
      combo: 0,
      feverFramesLeft: 0,
      feverGraceFramesLeft: 0,
      feverTimerFrames: 0,
      invincibleFrames: 0,
      player: { y: 0, vy: 0, jumpsUsed: 0 },
      obstacles,
      potions,
      events: 0,
    };
    this.framesUntilSpawn = intervalFramesAtSec(0);
  }

  /** 다음 step에서 처리할 탭 입력을 큐잉한다. 기록 시 state.frame을 함께 적는다. */
  queueTap(): void {
    this.pendingTaps++;
  }

  step(): void {
    const s = this.state;
    if (s.gameOver) {
      this.pendingTaps = 0;
      s.events = 0; // 죽은 스텝의 이벤트(EV_GAME_OVER 등)가 다음 스텝에 반복 발화하지 않도록
      return;
    }
    s.events = 0;

    const t = s.frame * C.DT;
    // 피버 중: 기본 속도에 배속 적용 (장애물 이동·거리 누적이 자동으로 배속됨)
    s.speed = speedAtSec(t) * (s.feverFramesLeft > 0 ? C.FEVER_SPEED_MULT : 1);

    // 1) 피버/유예 카운트다운
    // 유예를 먼저 감소시켜 피버 종료 시 설정한 값이 이번 스텝에 바로 반영되게 한다
    if (s.feverGraceFramesLeft > 0) s.feverGraceFramesLeft--;
    if (s.feverFramesLeft > 0) {
      s.feverFramesLeft--;
      if (s.feverFramesLeft === 0) {
        s.events |= C.EV_FEVER_END;
        s.feverGraceFramesLeft = Math.round(C.FEVER_GRACE_SEC * C.SIM_FPS);
      }
    }

    // 2) 입력 소비 — 점프 (피버 중: 무한 점프 + 탭마다 HP 회복, 평시: 지상 1단 + 공중 2단)
    while (this.pendingTaps > 0) {
      this.pendingTaps--;
      const canJump = s.feverFramesLeft > 0 || s.player.jumpsUsed < C.MAX_JUMPS;
      if (canJump) {
        s.player.vy = C.JUMP_VEL;
        s.player.jumpsUsed++;
        s.events |= C.EV_JUMP;
        if (s.feverFramesLeft > 0) this.heal(C.FEVER_TAP_HEAL);
      }
    }

    // 3) 플레이어 적분 + 착지 + 천장 클램프
    s.player.vy -= C.GRAVITY * C.DT;
    s.player.y += s.player.vy * C.DT;
    if (s.player.y <= 0 && s.player.vy <= 0) {
      // 프로토 3단 점프 버그의 교훈: 리셋은 '실제 착지' 판정에서만
      s.player.y = 0;
      s.player.vy = 0;
      s.player.jumpsUsed = 0;
    }
    if (s.player.y > C.PLAYER_Y_MAX) {
      s.player.y = C.PLAYER_Y_MAX;
      if (s.player.vy > 0) s.player.vy = 0;
    }

    // 4) 장애물 스폰 (간격은 매번 현재 난이도로 재계산)
    this.framesUntilSpawn--;
    if (this.framesUntilSpawn <= 0) {
      this.spawnObstacle(t);
      this.framesUntilSpawn = intervalFramesAtSec(t);
    }

    // 5) 포션 스폰 예약 소화 (장애물과 장애물 사이 시점)
    if (this.potionInFrames > 0) {
      this.potionInFrames--;
      if (this.potionInFrames === 0) {
        this.spawnPotion();
        this.potionInFrames = -1;
      }
    }

    // 6) 장애물/포션 이동 + 화면 밖 반환
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = s.obstacles[i]!;
      if (!o.active) continue;
      o.x -= s.speed * C.DT;
      if (o.x < C.DESPAWN_X) o.active = false;
    }
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = s.potions[i]!;
      if (!p.active) continue;
      p.x -= s.speed * C.DT;
      if (p.x < C.DESPAWN_X) p.active = false;
    }

    // 7) 장애물 통과 평가 — 장애물이 플레이어를 '완전히 통과'한 첫 스텝에 1회
    const playerLeft = C.PLAYER_X - C.PLAYER_W / 2;
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = s.obstacles[i]!;
      if (!o.active || o.scored) continue;
      if (o.x + o.w / 2 < playerLeft) {
        o.scored = true;
        s.combo++; // 통과하면 콤보 축적 (HP·거리 영향 없음)
      }
    }

    // 7b) 피버 타이머 — 피버 아님 + 콤보 살아있음 → 매 step 1씩 누적
    // FEVER_INTERVAL_SEC 초 연속 유지 시 발동, 발동 후 타이머 0 리셋
    if (s.feverFramesLeft <= 0 && s.combo > 0) {
      s.feverTimerFrames++;
      if (s.feverTimerFrames >= Math.round(C.FEVER_INTERVAL_SEC * C.SIM_FPS)) {
        s.feverFramesLeft = Math.round(C.FEVER_SEC * C.SIM_FPS);
        s.feverTimerFrames = 0;
        s.events |= C.EV_FEVER_START;
      }
    }

    // 8) 장애물 충돌 (무적 중 / 피버 중 / 유예 중이면 무시)
    if (s.invincibleFrames > 0) s.invincibleFrames--;
    if (s.invincibleFrames === 0 && s.feverFramesLeft <= 0 && s.feverGraceFramesLeft <= 0) {
      for (let i = 0; i < C.MAX_OBSTACLES; i++) {
        const o = s.obstacles[i]!;
        if (!o.active) continue;
        const overlapX = Math.abs(o.x - C.PLAYER_X) < (C.PLAYER_W + o.w) / 2;
        if (overlapX && s.player.y < o.h) {
          s.hp -= C.HIT_DAMAGE;
          s.invincibleFrames = Math.round((C.INVINCIBLE_MS / 1000) * C.SIM_FPS);
          s.events |= C.EV_HIT;
          if (s.combo > 0) s.events |= C.EV_COMBO_BREAK; // 콤보가 있었을 때만
          s.combo = 0;
          s.feverTimerFrames = 0;
          break; // 한 스텝에 한 번만
        }
      }
    }

    // 9) 포션 수집
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = s.potions[i]!;
      if (!p.active) continue;
      const overlapX = Math.abs(p.x - C.PLAYER_X) < C.PLAYER_W / 2 + C.POTION_R;
      const overlapY = s.player.y < p.y + C.POTION_R && s.player.y + C.PLAYER_H > p.y - C.POTION_R;
      if (overlapX && overlapY) {
        p.active = false;
        this.heal(C.POTION_HEAL);
        s.events |= C.EV_POTION;
      }
    }

    // 10) 체력 자연 감소 + 사망 판정 (충돌 데미지 포함 일괄) — 피버 중엔 드레인 정지
    if (s.feverFramesLeft <= 0) s.hp -= C.HP_DRAIN_PER_SEC * C.DT;
    if (s.hp <= 0) {
      s.hp = 0;
      s.gameOver = true;
      s.events |= C.EV_GAME_OVER;
      s.frame++;
      return;
    }

    // 11) 거리 누적
    s.distance += (s.speed * C.DT) / C.UNITS_PER_METER;

    s.frame++;
  }

  private heal(amount: number): void {
    this.state.hp = Math.min(C.HP_MAX, this.state.hp + amount);
  }

  private spawnObstacle(t: number): void {
    // RNG 소비 순서 고정 (패턴 종류에 무관하게 항상 동일):
    // (1) 패턴 ID, (2) 랜덤 높이, (3) 포션 여부, (4) 포션 Y (조건부)
    let patIdx = this.rng.nextInt(0, OBS_PATTERNS.length - 1);

    // 온보딩 램프: RNG는 이미 소비됨 — 리맵은 추가 RNG 호출 없음
    if (t < C.PATTERN_RAMP_SEC) {
      // 초반: SINGLE(0)·WIDE_LOW(2)만. roll 0,1,4→0(SINGLE), roll 2,3→2(WIDE_LOW)
      patIdx = (patIdx === 2 || patIdx === 3) ? 2 : 0;
    } else if (t < C.PATTERN_FULL_SEC) {
      // 중반: STAIRCASE(4) 미포함 → SINGLE(0)으로 대체
      if (patIdx === 4) patIdx = 0;
    }

    const heightRoll = this.rng.nextInt(C.OBS_H_MIN, C.OBS_H_MAX);
    if (this.rng.next() < C.POTION_CHANCE) {
      this.potionPendingY = this.rng.nextInt(C.POTION_Y_MIN, C.POTION_Y_MAX);
      this.potionInFrames = Math.max(1, Math.floor(intervalFramesAtSec(t) / 2));
    }

    const specs = OBS_PATTERNS[patIdx]!;
    // 빈 슬롯을 패턴 크기만큼 수집 — 미리 할당된 버퍼 재사용 (D6)
    let slotsFound = 0;
    for (let i = 0; i < C.MAX_OBSTACLES && slotsFound < specs.length; i++) {
      if (!this.state.obstacles[i]!.active) this.spawnSlots[slotsFound++] = i;
    }
    if (slotsFound < specs.length) return; // 풀 부족 — RNG는 이미 소비됨

    for (let j = 0; j < specs.length; j++) {
      const spec = specs[j]!;
      const o = this.state.obstacles[this.spawnSlots[j]!]!;
      o.active = true;
      o.x = C.SPAWN_X + spec.xOff;
      o.h = spec.h === OBS_PATTERN_H_RANDOM ? heightRoll : spec.h;
      o.w = spec.w;
      o.scored = false;
    }
  }

  private spawnPotion(): void {
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = this.state.potions[i]!;
      if (p.active) continue;
      p.active = true;
      p.x = C.SPAWN_X;
      p.y = this.potionPendingY;
      return;
    }
  }
}

/**
 * 입력 로그를 처음부터 재생해 시뮬을 복원한다.
 * 기록과 같은 모듈 계약(frame 인덱스 = queueTap 시점의 state.frame)을 공유 —
 * 골든 리플레이(T4)와 고스트 재생(Phase 2)의 공통 기반.
 */
export function replay(log: InputLog, frames: number): GameSim {
  const sim = new GameSim(log.seed);
  let cursor = 0;
  for (let f = 0; f < frames; f++) {
    while (cursor < log.events.length && log.events[cursor]!.frame === sim.state.frame) {
      sim.queueTap();
      cursor++;
    }
    sim.step();
  }
  return sim;
}
