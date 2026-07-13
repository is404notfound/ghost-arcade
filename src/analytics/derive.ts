// 순수 telemetry 파생 모듈 — sim.state를 읽기 전용으로만 참조한다 (sim 불가침, D2/PLAN.md).
// game_over 페이로드용 death_cause / near-miss 판정을 여기서 계산해 렌더 레이어(GameScene.ts)에
// 배선한다. sim은 여전히 결정론 상태머신으로만 남고, 이 모듈은 그 상태를 재해석만 한다.
import { collidesPlayer, overlapsPlayerX, type ObstacleState, type SimState } from '../sim/sim';
import * as C from '../sim/constants';

export type DeathCause = 'collision' | 'hp_drain';

export interface DeathCauseResult {
  death_cause: DeathCause;
  death_obstacle_height: number | null;
  speed_at_death: number;
}

/**
 * 사망 프레임의 원인을 판정한다 (T2).
 *
 * 규칙: `events`에 EV_HIT가 없으면 무조건 'hp_drain'이다 — 겹침(collidesPlayer)을 별도로
 * 재검사하지 않는다. 피버-유예(feverGraceFramesLeft) 중에는 장애물과 겹친 채로 드레인死할
 * 수 있는데, 그 순간 overlap만 보고 판정하면 'collision'으로 오표기된다 (design doc F4 회귀).
 * EV_HIT가 있을 때만 sim의 충돌 루프와 동일한 first-match-wins 순서로 슬롯을 훑어
 * 충돌한 장애물의 높이를 찾는다.
 */
export function deriveDeathCause(state: SimState, events: number): DeathCauseResult {
  if ((events & C.EV_HIT) === 0) {
    return {
      death_cause: 'hp_drain',
      death_obstacle_height: null,
      speed_at_death: state.speed,
    };
  }

  let death_obstacle_height: number | null = null;
  for (const o of state.obstacles) {
    if (!o.active) continue;
    if (collidesPlayer(C.PLAYER_X, state.player.y, o)) {
      death_obstacle_height = o.h;
      break; // sim 충돌 루프와 동일하게 첫 매칭 슬롯에서 멈춘다
    }
  }

  return {
    death_cause: 'collision',
    death_obstacle_height,
    speed_at_death: state.speed,
  };
}

// 니어미스 판정 임계값(px) — 장애물 통과 시 수직 여유(player.y - o.h)가 이 값 미만이면
// "박빙 통과"로 센다. placeholder — design doc Open Q3: 골든 리플레이 튜닝 필요, 이 작업 범위 밖.
export const NEAR_MISS_THRESHOLD_PX = 20;

interface SlotTracker {
  wasActive: boolean; // 직전 스텝의 active 여부 — inactive→active 전이(신규 스폰) 감지용
  wasOverlapping: boolean; // 직전 스텝의 overlapX 여부 — overlap 구간 종료(통과) 감지용
  minClearance: number; // 이번 overlap 구간 동안의 최소 수직 여유 (player.y - o.h)
}

export interface NearMissTracker {
  /** 고정 60fps sim 스텝마다 정확히 1회 호출한다 (렌더 프레임당 X). fps 무관 결정론의 전제조건. */
  onStep(state: SimState): void;
  count(): number;
}

/**
 * 니어미스(박빙 통과) 카운터를 생성한다 (T3).
 *
 * 판정 축은 수직(player.y - o.h)이다 — 장애물은 항상 x≈PLAYER_X로 스크롤해 오므로 최근접
 * 시점의 수평 간격은 항상 ~0이라 수평은 판정 축으로 무의미하다(design doc 원문 "수평 여유"는
 * 부정확한 표현). 슬롯별로 overlapX 구간 동안 수직 여유의 러닝 최소값을 추적하다가, 구간이
 * 끝나는(통과) 순간 [0, threshold) 범위였으면 니어미스 1회로 센다. 음수는 실제 충돌이므로
 * 제외. 슬롯이 inactive→active로 전이(새 장애물 스폰)할 때마다 러닝 최소값을 리셋해 이전
 * 점유자의 값이 다음 판정에 새지 않게 한다.
 */
export function createNearMissTracker(threshold: number = NEAR_MISS_THRESHOLD_PX): NearMissTracker {
  const slots: SlotTracker[] = [];
  let nearMissCount = 0;

  function slotFor(i: number): SlotTracker {
    let slot = slots[i];
    if (!slot) {
      slot = { wasActive: false, wasOverlapping: false, minClearance: Infinity };
      slots[i] = slot;
    }
    return slot;
  }

  function judgePass(slot: SlotTracker): void {
    if (slot.minClearance >= 0 && slot.minClearance < threshold) {
      nearMissCount++;
    }
    slot.wasOverlapping = false;
    slot.minClearance = Infinity;
  }

  function onStep(state: SimState): void {
    for (let i = 0; i < state.obstacles.length; i++) {
      const o: ObstacleState = state.obstacles[i]!;
      const slot = slotFor(i);

      if (o.active && !slot.wasActive) {
        // 새 장애물이 이 슬롯에 스폰됨 — 이전 점유자의 잔여 최소값이 새 판정에 새지 않도록 리셋
        slot.minClearance = Infinity;
        slot.wasOverlapping = false;
      }

      if (o.active) {
        if (overlapsPlayerX(C.PLAYER_X, o)) {
          const clearance = state.player.y - o.h;
          if (clearance < slot.minClearance) slot.minClearance = clearance;
          slot.wasOverlapping = true;
        } else if (slot.wasOverlapping) {
          // 겹침 구간이 방금 끝났다 = 장애물을 통과했다 — 이번 통과를 판정
          judgePass(slot);
        }
      } else if (slot.wasOverlapping) {
        // 겹친 채로 비활성화된 엣지 케이스(예: 화면 밖 반환)도 마무리 판정
        judgePass(slot);
      }

      slot.wasActive = o.active;
    }
  }

  function count(): number {
    return nearMissCount;
  }

  return { onStep, count };
}

// ── prev-run 스냅샷 / lifetime 카운터 / retry_latency (T4,T5,T6,T7) ─────────
// storage를 명시 인자로 받는다 — 기존 loadTopRuns(storage, seed) 컨벤션과 동일하게,
// GameScene(Phaser 씬) 안에 인라인하지 않고 여기 순수함수로 뽑아야 단위테스트가 가능하다
// (design doc Issue 5 — 렌더 씬에 인라인된 로직은 테스트 불가).

const PREV_RUN_SNAPSHOT_KEY = 'ga:prev-run-snapshot';
const PREV_RUN_SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000; // 1시간
const RETRY_LATENCY_MAX_MS = 60 * 1000;
const LIFETIME_RUNS_KEY = 'ga:lifetime-runs';

export type RestartReason = 'first' | 'death' | 'pause';

export interface PrevRunSnapshot {
  prev_run_overtakes: number | null;
  prev_run_had_fever: boolean | null;
  prev_run_near_record: boolean | null;
  prev_run_death_cause: DeathCause | null;
  savedAtMs: number | null; // retry_latency_ms 계산용 — game_over 시각(Date.now) 재사용
}

export const EMPTY_PREV_RUN_SNAPSHOT: PrevRunSnapshot = {
  prev_run_overtakes: null,
  prev_run_had_fever: null,
  prev_run_near_record: null,
  prev_run_death_cause: null,
  savedAtMs: null,
};

/**
 * 직전 판 스냅샷을 읽고 즉시 소비(삭제)한다 (T4). 파손 JSON·QuotaExceeded 등 어떤 실패도
 * throw하지 않는다 — 실패 시 전 필드 null로 폴백한다("계측 실패 ≠ 게임 크래시" 원칙,
 * 기존 analytics/index.ts 래퍼와 동일한 불변식을 여기서도 지킨다).
 */
export function readAndConsumePrevRunSnapshot(storage: Storage, nowMs: number): PrevRunSnapshot {
  try {
    const raw = storage.getItem(PREV_RUN_SNAPSHOT_KEY);
    if (!raw) return EMPTY_PREV_RUN_SNAPSHOT;
    storage.removeItem(PREV_RUN_SNAPSHOT_KEY); // consume-once — 유효성과 무관하게 항상 삭제
    const snap = JSON.parse(raw) as Partial<{
      savedAtMs: number;
      overtakes: number;
      hadFever: boolean;
      nearRecord: boolean;
      deathCause: DeathCause;
    }>;
    if (typeof snap.savedAtMs !== 'number') return EMPTY_PREV_RUN_SNAPSHOT;
    if (nowMs - snap.savedAtMs > PREV_RUN_SNAPSHOT_MAX_AGE_MS) return EMPTY_PREV_RUN_SNAPSHOT;
    return {
      prev_run_overtakes: typeof snap.overtakes === 'number' ? snap.overtakes : null,
      prev_run_had_fever: typeof snap.hadFever === 'boolean' ? snap.hadFever : null,
      prev_run_near_record: typeof snap.nearRecord === 'boolean' ? snap.nearRecord : null,
      prev_run_death_cause: typeof snap.deathCause === 'string' ? snap.deathCause : null,
      savedAtMs: snap.savedAtMs,
    };
  } catch {
    return EMPTY_PREV_RUN_SNAPSHOT; // 파손 JSON 등 — null 폴백, throw 금지
  }
}

/** 이번 판 결과를 다음 game_start가 소비할 스냅샷으로 저장한다 (game_over에서 호출). */
export function writePrevRunSnapshot(
  storage: Storage,
  nowMs: number,
  overtakes: number,
  hadFever: boolean,
  nearRecord: boolean | null,
  deathCause: DeathCause,
): void {
  try {
    storage.setItem(
      PREV_RUN_SNAPSHOT_KEY,
      JSON.stringify({ savedAtMs: nowMs, overtakes, hadFever, nearRecord, deathCause }),
    );
  } catch {
    // localStorage 실패 — 다음 판 prev_run_*이 null이 될 뿐, 게임엔 영향 없음
  }
}

/**
 * 생애 누적 판 인덱스를 pre-increment(T7) — game_start/game_over가 같은 값을 공유한다.
 * `fallbackCurrent`는 localStorage 실패 시 호출자가 들고 있는 마지막 인메모리 값(없으면 0) —
 * 완전히 크래시시키는 대신 세션 내에서만이라도 카운터가 이어지게 한다.
 */
export function nextLifetimeRunIndex(storage: Storage, fallbackCurrent = 0): number {
  try {
    const current = parseInt(storage.getItem(LIFETIME_RUNS_KEY) ?? '0', 10);
    const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
    storage.setItem(LIFETIME_RUNS_KEY, String(next));
    return next;
  } catch {
    return fallbackCurrent + 1;
  }
}

/**
 * retry_latency_ms 계산 (T6). death-retry일 때만 유효 — pause-restart/첫 판은 null.
 * 스냅샷의 Date.now 타임스탬프를 그대로 재사용한다(성능 시계는 리로드 시 리셋되어 부적합).
 */
export function computeRetryLatencyMs(
  restartReason: RestartReason,
  snapshotAtMs: number | null,
  nowMs: number,
  wentBackgroundSinceLastGameOver: boolean,
): number | null {
  if (restartReason !== 'death') return null;
  if (snapshotAtMs === null) return null;
  if (wentBackgroundSinceLastGameOver) return null; // best-effort — 안 터지면 60초 상한이 backstop
  const elapsed = nowMs - snapshotAtMs;
  if (elapsed < 0 || elapsed > RETRY_LATENCY_MAX_MS) return null;
  return elapsed;
}
