// 개발 전용 테스트 유틸 — KVStore 주입 방식이라 headless 테스트 가능.
// main.ts에서 import.meta.env.DEV 가드로만 호출 → 프로덕션 번들에서 제외됨.
import { GameSim } from './sim/sim';
import { createInputLog, recordTap, recordRevive } from './sim/inputLog';
import { saveRun, type KVStore } from './ghostStore';
import * as C from './sim/constants';

// 15가지 탭 간격: 숫자가 작을수록 자주 점프 (더 공격적인 봇)
const BOT_CADENCES = [28, 33, 38, 43, 48, 53, 58, 63, 68, 73, 78, 85, 95, 110, 130];

export type ReviveDevHandle = {
  /** 광고 없이 sim+로그 부활 — GameScene이 등록한 콜백 */
  reviveNow: () => void;
};

let reviveHandle: ReviveDevHandle | null = null;

/** GameScene이 create에서 등록. 콘솔: window.__reviveNow() */
export function registerReviveDevHandle(h: ReviveDevHandle | null): void {
  reviveHandle = h;
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__reviveNow = () => {
      if (!reviveHandle) {
        console.warn('[dev] __reviveNow: GameScene 미등록');
        return;
      }
      reviveHandle.reviveNow();
    };
  }
}

/**
 * 주어진 시드 코스를 다양한 캐던스로 15번 돌려 저장소를 채운다.
 * 게임 재시작 시 이 기록들이 고스트로 등장한다.
 */
export function seedGhosts(store: KVStore, seed: number): void {
  for (const cadence of BOT_CADENCES) {
    const sim = new GameSim(seed);
    const log = createInputLog(seed);
    let guard = 0;
    // 프레임 0은 건너뜀 — recordTap이 frame 역행을 막기 때문
    while (!sim.state.gameOver && guard++ < C.SIM_FPS * 120) {
      if (sim.state.frame > 0 && sim.state.frame % cadence === 0) {
        recordTap(log, sim.state.frame);
        sim.queueTap();
      }
      sim.step();
    }
    saveRun(store, seed, log, sim.state.distance);
  }
}

/** headless: 한 번 죽고 부활한 로그를 만들어 저장 (고스트 재생 검증용) */
export function seedReviveGhost(store: KVStore, seed: number): void {
  const sim = new GameSim(seed);
  const log = createInputLog(seed);
  let guard = 0;
  while (!sim.state.gameOver && guard++ < C.SIM_FPS * 120) {
    if (sim.state.frame > 0 && sim.state.frame % 40 === 0) {
      recordTap(log, sim.state.frame);
      sim.queueTap();
    }
    sim.step();
  }
  recordRevive(log, sim.state.frame);
  sim.revive();
  guard = 0;
  while (!sim.state.gameOver && guard++ < C.SIM_FPS * 30) {
    if (sim.state.frame % 40 === 0) {
      recordTap(log, sim.state.frame);
      sim.queueTap();
    }
    sim.step();
  }
  saveRun(store, seed, log, sim.state.distance);
}
