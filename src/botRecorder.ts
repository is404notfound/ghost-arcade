// 헤드리스 봇 고스트 생성기 — 콜드스타트(B4) 시드에 실제 플레이어가 없을 때
// 가짜 경쟁자를 제공해 "첫 판도 경쟁 필드"를 보장한다 (TODOS 봇 커버리지 정책).
//
// 봇은 서버에 is_bot=true 로 저장된다. 실제 유저 기록이 쌓이면 자연히 밀려난다.
// 결정론: GameSim + LCG 지터 모두 동일 시드 → 동일 결과. 서버 업로드 무결성과 직결.
import { GameSim } from './sim/sim';
import { createInputLog, recordTap, type InputLog } from './sim/inputLog';
import { SIM_FPS } from './sim/constants';

/** 봇 플레이 스타일 */
export type BotProfile = 'casual' | 'skilled' | 'pro';

export interface BotRunResult {
  log: InputLog;
  distance: number;
}

interface ProfileConfig {
  intervalFrames: number; // 탭 기본 간격 (프레임)
  jitterFrames: number;   // ±jitter 범위
}

const PROFILES: Record<BotProfile, ProfileConfig> = {
  casual:  { intervalFrames: 35, jitterFrames: 8 },
  skilled: { intervalFrames: 22, jitterFrames: 4 },
  pro:     { intervalFrames: 16, jitterFrames: 3 },
};

// 무한루프 안전장치: 15분 이상 돌면 강제 종료
const MAX_FRAMES = SIM_FPS * 60 * 15;

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
 * casual / skilled / pro 세 프로파일 모두 기록.
 * 거리 내림차순 정렬 후 반환 — 리더보드에 바로 사용 가능.
 */
export function recordAllBotRuns(seed: number): BotRunResult[] {
  const profiles: BotProfile[] = ['casual', 'skilled', 'pro'];
  const results = profiles.map((p, i) =>
    recordBotRun(seed, p, seed ^ (i * 0x9e3779b9)),
  );
  return results.sort((a, b) => b.distance - a.distance);
}
