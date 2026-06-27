// 헤드리스 봇 고스트 생성기 — 콜드스타트(B4) 시드에 실제 플레이어가 없을 때
// 가짜 경쟁자를 제공해 "첫 판도 경쟁 필드"를 보장한다 (TODOS 봇 커버리지 정책).
//
// 봇은 서버에 is_bot=true 로 저장된다. 실제 유저 기록이 쌓이면 자연히 밀려난다.
// 결정론: GameSim + LCG 지터 모두 동일 시드 → 동일 결과. 서버 업로드 무결성과 직결.
import { GameSim } from './sim/sim';
import { createInputLog, recordTap, type InputLog } from './sim/inputLog';
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

/**
 * 8개 봇을 "초반 사망 ~ 최고수"까지 스펙트럼으로 생성한다 (GHOST_TOP_N=8에 맞춤).
 * 서로 다른 rngSeed로 지터가 달라지므로 같은 프로파일도 경로가 살짝 다름.
 * 거리 내림차순 정렬 후 반환 — 리더보드에 바로 사용 가능.
 */
export function recordAllBotRuns(seed: number): BotRunResult[] {
  const profiles: BotProfile[] = [
    'early', 'casual', 'medium', 'skilled', 'good', 'pro', 'elite', 'ultra',
  ];
  const results = profiles.map((p, i) =>
    recordBotRun(seed, p, seed ^ (i * 0x9e3779b9)),
  );
  return results.sort((a, b) => b.distance - a.distance);
}
