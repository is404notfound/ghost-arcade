// 헤드리스 봇 고스트 생성기 — 콜드스타트(B4) 시드에 실제 플레이어가 없을 때
// 가짜 경쟁자를 제공해 "첫 판도 경쟁 필드"를 보장한다 (TODOS 봇 커버리지 정책).
//
// 봇은 서버에 is_bot=true 로 저장된다. 실제 유저 기록이 쌓이면 자연히 밀려난다.
// 결정론: GameSim + LCG 지터 모두 동일 시드 → 동일 결과. 서버 업로드 무결성과 직결.
//
// 두 세대의 봇:
//   recordBotRun         — 고정 케이던스 탭(구세대). 거리가 시드 운에 좌우돼
//                          장거리 커버리지를 보장 못 한다. 테스트/참조용으로 유지.
//   recordReactiveBotRun — 장애물·포션을 보고 반응(신세대). 목표 거리까지 달린 뒤
//                          탭을 멈춰 자연사 → 거리 밴드를 정확히 제어. 장거리(3~8천m)
//                          구간에도 "쫓을 등"을 보장한다 (장거리 지루함 대책 1).
import { GameSim } from './sim/sim';
import { createInputLog, recordTap, type InputLog } from './sim/inputLog';
import * as C from './sim/constants';
import { SIM_FPS } from './sim/constants';

/** 봇 플레이 스타일 */
export type BotProfile = 'early' | 'casual' | 'medium' | 'skilled' | 'good' | 'pro' | 'elite' | 'ultra';

export interface BotRunResult {
  log: InputLog;
  distance: number;
}

interface ProfileConfig {
  intervalFrames: number; // 탭 기본 간격 (프레임)
  jitterFrames: number;   // ±jitter 범위
}

/**
 * 난이도 분포 (8종):
 *   early   — 초반 사망 (~200m) : 탭 거의 없음, 실수 많음
 *   casual  — 짧은 거리 (~500m) : 드문 탭
 *   medium  — 중거리 (~1500m)   : 보통 플레이
 *   skilled — 중거리+ (~3000m)  : 안정적 탭
 *   good    — 장거리 (~6000m)   : 좋은 반응
 *   pro     — 장거리+ (~10000m) : 빠른 정확 탭
 *   elite   — 고수 (~20000m)   : 매우 빠른 탭
 *   ultra   — 최고수 (무한대에 가까움): 극한 탭
 */
const PROFILES: Record<BotProfile, ProfileConfig> = {
  early:   { intervalFrames: 60, jitterFrames: 20 }, // 2초마다 탭 + 큰 실수
  casual:  { intervalFrames: 38, jitterFrames: 12 }, // ~1.3초마다
  medium:  { intervalFrames: 28, jitterFrames: 8  }, // ~0.93초마다
  skilled: { intervalFrames: 22, jitterFrames: 5  }, // ~0.73초마다
  good:    { intervalFrames: 18, jitterFrames: 4  }, // ~0.6초마다
  pro:     { intervalFrames: 15, jitterFrames: 3  }, // ~0.5초마다
  elite:   { intervalFrames: 13, jitterFrames: 2  }, // ~0.43초마다
  ultra:   { intervalFrames: 11, jitterFrames: 1  }, // ~0.37초마다
};

// 무한루프 안전장치: 30분 이상 돌면 강제 종료
const MAX_FRAMES = SIM_FPS * 60 * 30;

/** LCG — 결정론 유지를 위해 Math.random() 대신 사용 */
function lcgNext(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) | 0;
}

/**
 * 주어진 시드·프로파일로 봇 러닝 1회 시뮬레이션 → InputLog + 최종 거리 반환.
 * rngSeed를 지정하지 않으면 seed 자체를 사용한다.
 */
export function recordBotRun(seed: number, profile: BotProfile, rngSeed?: number): BotRunResult {
  const cfg = PROFILES[profile];
  const sim = new GameSim(seed);
  const log = createInputLog(seed);

  let rng = rngSeed ?? seed;
  let nextTapFrame = cfg.intervalFrames;

  while (!sim.state.gameOver && sim.state.frame < MAX_FRAMES) {
    if (sim.state.frame === nextTapFrame) {
      recordTap(log, sim.state.frame);
      sim.queueTap();
      // 다음 탭 프레임 — 기본 간격 + [-jitter, +jitter] 범위 지터
      rng = lcgNext(rng);
      const jitter = (rng >>> 0) % (cfg.jitterFrames * 2 + 1);
      nextTapFrame = sim.state.frame + cfg.intervalFrames - cfg.jitterFrames + jitter;
    }
    sim.step();
  }

  return { log, distance: sim.state.distance };
}

// ─── 반응형 봇 (신세대) ──────────────────────────────────────────────────────

export interface ReactiveBotOpts {
  /** 장애물당 회피 실패 확률 (0~1). 실패한 장애물은 그냥 들이받는다 — 실수 연출. */
  missPct: number;
  /** LCG 시드 — 미지정 시 seed 사용. 같은 값 = 같은 로그 (결정론). */
  rngSeed?: number;
}

// 점프 리드 — 장애물 왼쪽 엣지가 플레이어에 닿기 N프레임 전에 탭.
// 높이별 도달 시간(y(t)=680t-700t²)에 맞춰 "가능한 늦게" 뛴다: 체공(~58f)이
// 고속 구간 장애물 간격(~45f)보다 길어서, 일찍 뛸수록 다음 장애물을 공중에서
// 맞이하는 연쇄가 생긴다. 늦게 뛰면 지상 시간(포션·다음 점프 여유)이 는다.
const JUMP_LEAD_FRAMES = 20; // TALL(148) 도달 t≈0.33s 기준 상한
function leadForHeight(h: number): number {
  if (h >= 120) return JUMP_LEAD_FRAMES;
  if (h >= 92) return 13;
  if (h >= 72) return 10;
  return 8;
}
// 포션 리드 — 10프레임 전 탭이면 겹침 시점 y≈94로 전 높이(70~150) 수집 가능.
const POTION_LEAD_FRAMES = 10;

/**
 * 장애물·포션에 반응하는 봇 러닝 1회 → InputLog + 최종 거리.
 * targetMeters 도달 후 탭을 멈춰 자연사한다 (사망 지점 ≈ target + 100~400m).
 * missPct가 높을수록 피격이 잦아 target 전에 죽을 수 있다 — 하위 티어의 자연스러운 분포.
 */
export function recordReactiveBotRun(
  seed: number,
  targetMeters: number,
  opts: ReactiveBotOpts,
): BotRunResult {
  const sim = new GameSim(seed);
  const log = createInputLog(seed);

  let rng = (opts.rngSeed ?? seed) | 0;
  const roll = (): number => {
    rng = lcgNext(rng);
    return ((rng >>> 8) % 1000) / 1000; // 0~0.999
  };

  // 장애물 풀 슬롯별 회피 결정 — 슬롯 재사용(x가 다시 커짐) 시 리롤
  const rolled = new Array<boolean>(C.MAX_OBSTACLES).fill(false);
  const willMiss = new Array<boolean>(C.MAX_OBSTACLES).fill(false);
  const leadAdj = new Array<number>(C.MAX_OBSTACLES).fill(0);
  const prevX = new Array<number>(C.MAX_OBSTACLES).fill(Infinity);
  // 페이스 조절용 회복 가뭄 카운터 — 최고 속도에선 체공이 길어 포션을 못 먹는다.
  // 가뭄이 길면 HP 여유가 있을 때 의도적으로 한 대 맞아 속도를 리셋한다
  // (피격 = 속도 SPEED_BASE 리셋 설계를 활용하는, 사람도 쓰는 지속 가능 페이싱).
  let framesSinceHeal = 0;
  // 8초 — 피버 간격(10s)보다 짧아야 피버 사이의 포션 가뭄에 반응할 수 있다
  const HEAL_DROUGHT_FRAMES = SIM_FPS * 8;

  while (!sim.state.gameOver && sim.state.frame < MAX_FRAMES) {
    const s = sim.state;
    let tap = false;

    if (s.distance < targetMeters && s.feverFramesLeft > 0) {
      // 피버 연타 회복 — 피버 중 탭당 +1HP(FEVER_TAP_HEAL), 충돌 면역 + 무한 점프라
      // 3프레임마다 연타(≈20타/초)로 체력을 재충전한다. 사람 플레이어도 쓰는 전략.
      // 장거리 생존의 핵심: 포션만으로는 후반 드레인을 못 따라간다.
      if (s.frame % 2 === 0) tap = true;
    } else if (s.distance < targetMeters) {
      const pxPerFrame = s.speed * C.DT;
      const playerLeft = C.PLAYER_X - C.PLAYER_W / 2;
      const playerRight = C.PLAYER_X + C.PLAYER_W / 2;

      // 가장 가까운 위협 장애물 탐색 (+ 슬롯별 회피 롤)
      let nearestFtr = Infinity; // 왼쪽 엣지가 플레이어에 닿기까지 남은 프레임
      let nearestH = 0;
      let nearestW = C.OBS_W;
      let nearestMiss = false;
      let nearestLead = JUMP_LEAD_FRAMES;
      let secondFtr = Infinity; // 그 다음 장애물 — TALL 룩어헤드용
      let secondH = 0;
      for (let i = 0; i < C.MAX_OBSTACLES; i++) {
        const o = s.obstacles[i]!;
        if (!o.active) {
          rolled[i] = false;
          prevX[i] = Infinity;
          continue;
        }
        if (o.x > prevX[i]!) rolled[i] = false; // 슬롯 재사용 감지
        prevX[i] = o.x;
        if (o.x + o.w / 2 < playerLeft) continue; // 이미 통과한 장애물
        const ftr = (o.x - o.w / 2 - playerRight) / pxPerFrame;
        if (!rolled[i] && ftr <= JUMP_LEAD_FRAMES + 4) {
          rolled[i] = true;
          const pacingMiss =
            s.hp > 60 &&
            s.speed >= C.SPEED_MAX - 1 &&
            framesSinceHeal > HEAL_DROUGHT_FRAMES;
          // 페이싱 미스는 1회성 — 카운터를 소진해 연속 장애물 헌납(사망 소용돌이) 방지
          if (pacingMiss) framesSinceHeal = 0;
          willMiss[i] = roll() < opts.missPct || pacingMiss;
          // 탭 타이밍 지터는 "일찍 뛰는 쪽"(0~+3)만 — 늦게 뛰면 TALL(148)을 못 넘는다
          leadAdj[i] = Math.floor(roll() * 4);
        }
        if (ftr < nearestFtr) {
          secondFtr = nearestFtr;
          secondH = nearestH;
          nearestFtr = ftr;
          nearestH = o.h;
          nearestW = o.w;
          nearestMiss = rolled[i]! && willMiss[i]!;
          nearestLead = leadForHeight(o.h) + leadAdj[i]!;
        } else if (ftr < secondFtr) {
          secondFtr = ftr;
          secondH = o.h;
        }
      }
      // TALL 룩어헤드 — 다음 장애물이 TALL(상승 20f 필요)이고 가까우면, 현재
      // 장애물을 일찍 뛰어 착지를 앞당긴다. 늦게 뛰면 착지가 TALL 리드를 침범해
      // "늦은 급탭 + 구조 실패" 연쇄(반복 피격 시그니처)로 이어진다.
      if (secondH >= 120 && secondFtr - nearestFtr < 70) {
        nearestLead = Math.max(nearestLead, JUMP_LEAD_FRAMES);
      }

      const grounded = s.player.y <= 0.01 && s.player.jumpsUsed === 0;
      if (grounded) {
        if (nearestFtr <= nearestLead && nearestFtr > -1 && !nearestMiss) {
          tap = true; // 장애물 점프
        } else if (
          nearestFtr > POTION_LEAD_FRAMES &&
          // TALL(≥120)이 다가올 땐 포션을 포기 — 체공 중에 맞이하면 2단 점프까지
          // 소진해 다음 착지가 늦어지는 연쇄로 이어진다.
          (nearestH < 120 || nearestFtr > 70)
        ) {
          // 포션 점프 — 임박한 장애물 탭과만 간섭 금지. 낮은 장애물(<120)은
          // 포션 점프 궤적으로도 넘어가진다 (모자라면 공중 구조 2단 점프가 보정).
          for (let i = 0; i < C.MAX_POTIONS; i++) {
            const p = s.potions[i]!;
            if (!p.active || p.x < C.PLAYER_X) continue;
            const ftrP = (p.x - C.PLAYER_X) / pxPerFrame;
            if (ftrP <= POTION_LEAD_FRAMES) {
              tap = true;
              break;
            }
          }
        }
      } else if (
        !nearestMiss &&
        (s.feverFramesLeft > 0 || s.player.jumpsUsed < C.MAX_JUMPS) &&
        nearestFtr <= leadForHeight(nearestH) + 2 &&
        nearestFtr > -2
      ) {
        // 공중 구조 — 겹침 시작·종료 시점 고도를 포물선(y+vy·t−½g·t²)으로 투영해,
        // 어느 한쪽이라도 모자라면 2단 점프. 상승 중 고도 부족(늦은 착지 후 급탭)과
        // 하강 중 낙하(포션 점프 뒤 겹침 도중 침하)를 모두 커버한다.
        // 발동 창은 높이별 상승 시간(leadForHeight) — TALL(148)은 상승에 20f가
        // 필요해 임박(≤12f) 발동으로는 못 살린다.
        const proj = (frames: number): number => {
          const t = Math.max(0, frames) * C.DT;
          return s.player.y + s.player.vy * t - (C.GRAVITY / 2) * t * t;
        };
        const overlapFrames = (C.PLAYER_W + nearestW) / pxPerFrame;
        if (
          proj(nearestFtr) < nearestH + 8 ||
          proj(nearestFtr + overlapFrames) < nearestH + 8
        ) {
          tap = true;
        }
      }
    }
    // target 도달 후: 탭 정지 → 장애물 피격 + 드레인으로 자연사

    if (tap) {
      recordTap(log, s.frame);
      sim.queueTap();
    }
    sim.step();
    if ((sim.state.events & C.EV_POTION) !== 0 || sim.state.feverFramesLeft > 0) {
      framesSinceHeal = 0;
    } else {
      framesSinceHeal++;
    }
  }

  return { log, distance: sim.state.distance };
}

// 8개 봇의 목표 거리(m) 스펙트럼 — GHOST_TOP_N=8. 실제 목표는 시드별 ±15% 지터.
// 천장 = 실유저 p90(~3918m) 근처(4000)로 캡. 구 천장(7800→달성 ~5923)은 신규가
// 한 달 안에 못 넘어 일간 보드가 "봇 벽"이 됐다(docs/launch-log 2026-07-24 결정).
// 잘 하는 실유저가 챌린지 창 안에 일간 1위를 탈환할 수 있게 하는 게 목적.
// 하단은 촘촘하게(180~1300) — 사다리(selectLadder) 초반 발판·median 576m 유저의 제침용.
const BOT_TARGETS_M = [180, 420, 800, 1300, 1900, 2600, 3300, 4000] as const;
// 티어별 회피 실패율 — 하위 봇일수록 자주 들이받아 target 전 사망도 자연스럽게 발생.
// 상위 티어는 0에 가깝게: 정책 자체의 간헐적 피격 + 페이싱 미스가 이미 "사람 같은
// 실수"를 만들고, 인위적 미스는 콤보 단절(피버 지연)로 장거리 생존을 무너뜨린다.
const BOT_MISS_PCT = [0.45, 0.3, 0.18, 0.1, 0.04, 0.015, 0.008, 0] as const;

/**
 * 8개 봇을 "초반 사망 ~ 상위권(~4천m, 실유저 p90)"까지 스펙트럼으로 생성한다 (GHOST_TOP_N=8).
 * 반응형 봇 + 목표 거리 밴딩 — 어느 시드에서든 장거리 경쟁자가 보장된다.
 * 장거리 티어(목표 ≥2000m)는 rngSeed 변형 3개 중 최장 기록 채택: 시드 특이
 * 구간(고속 TALL 연속 등)에서 특정 지터 조합만 살아남는 경우를 흡수한다.
 * 거리 내림차순 정렬 후 반환 — 리더보드에 바로 사용 가능. (전 과정 결정론)
 */
export function recordAllBotRuns(seed: number): BotRunResult[] {
  const results = botRunSpecs(seed).map(
    ({ target, missPct, rngSeeds }) => recordTierBest(seed, target, missPct, rngSeeds),
  );
  return results.sort((a, b) => b.distance - a.distance);
}

/**
 * recordAllBotRuns의 비동기 버전 — 봇 1기(~20ms)마다 메인 스레드에 양보한다.
 * 게임 플레이 중(콜드스타트 보충) 호출해도 프레임 드랍이 없도록. 결과는 동일 (결정론).
 */
export async function recordAllBotRunsAsync(seed: number): Promise<BotRunResult[]> {
  const results: BotRunResult[] = [];
  for (const { target, missPct, rngSeeds } of botRunSpecs(seed)) {
    let best: BotRunResult | null = null;
    for (const rngSeed of rngSeeds) {
      const run = recordReactiveBotRun(seed, target, { missPct, rngSeed });
      if (!best || run.distance > best.distance) best = run;
      await new Promise((r) => setTimeout(r, 0)); // 런 사이 양보
    }
    results.push(best!);
  }
  return results.sort((a, b) => b.distance - a.distance);
}

interface BotRunSpec {
  target: number;
  missPct: number;
  rngSeeds: number[];
}

function botRunSpecs(seed: number): BotRunSpec[] {
  let rng = seed | 0;
  return BOT_TARGETS_M.map((base, i) => {
    rng = lcgNext(rng);
    const jitter = 0.85 + (((rng >>> 8) % 1000) / 1000) * 0.3; // 0.85~1.15
    const target = base * jitter;
    const variants = target >= 2000 ? 3 : 1;
    const rngSeeds: number[] = [];
    for (let v = 0; v < variants; v++) rngSeeds.push((seed ^ (i * 0x9e3779b9)) + v * 0x85ebca6b);
    return { target, missPct: BOT_MISS_PCT[i]!, rngSeeds };
  });
}

function recordTierBest(
  seed: number,
  target: number,
  missPct: number,
  rngSeeds: number[],
): BotRunResult {
  let best: BotRunResult | null = null;
  for (const rngSeed of rngSeeds) {
    const run = recordReactiveBotRun(seed, target, { missPct, rngSeed });
    if (!best || run.distance > best.distance) best = run;
  }
  return best!;
}
