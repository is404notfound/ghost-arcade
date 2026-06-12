import { describe, test, expect } from 'vitest';
import { GameSim, replay } from '../sim';
import { GhostDriver } from '../ghost';
import { createInputLog, recordTap, type InputLog } from '../inputLog';

/** 실플레이를 흉내내 로그를 만든다: 의사-불규칙 탭으로 게임오버까지 */
function playAndRecord(seed: number): { log: InputLog; finalFrame: number; finalJson: string } {
  const sim = new GameSim(seed);
  const log = createInputLog(seed);
  let guard = 0;
  while (!sim.state.gameOver && guard++ < 20000) {
    if ((sim.state.frame * 7919) % 89 < 2) {
      recordTap(log, sim.state.frame);
      sim.queueTap();
    }
    sim.step();
  }
  return { log, finalFrame: sim.state.frame, finalJson: JSON.stringify(sim.state) };
}

describe('GhostDriver — lockstep 재생', () => {
  test('lockstep 재생 결과 == replay() 일괄 재생 결과 (골든 리플레이 불변식)', () => {
    const { log, finalFrame } = playAndRecord(20260612);

    const batch = replay(log, finalFrame);
    const ghost = new GhostDriver(log);
    for (let i = 0; i < finalFrame; i++) ghost.step();

    expect(JSON.stringify(ghost.sim.state)).toBe(JSON.stringify(batch.state));
  });

  test('고스트는 원본 플레이와 같은 프레임에 같은 상태로 죽는다', () => {
    const { log, finalFrame, finalJson } = playAndRecord(987);

    const ghost = new GhostDriver(log);
    let guard = 0;
    while (!ghost.finished && guard++ < 25000) ghost.step();

    expect(ghost.sim.state.gameOver).toBe(true);
    expect(ghost.sim.state.frame).toBe(finalFrame);
    expect(JSON.stringify(ghost.sim.state)).toBe(finalJson);
  });

  test('finished 후 step()은 no-op이다 (라이브 루프가 계속 호출해도 안전)', () => {
    const { log } = playAndRecord(42);
    const ghost = new GhostDriver(log);
    let guard = 0;
    while (!ghost.finished && guard++ < 25000) ghost.step();
    const frozen = JSON.stringify(ghost.sim.state);
    ghost.step();
    ghost.step();
    expect(JSON.stringify(ghost.sim.state)).toBe(frozen);
  });

  test('라이브 sim과 같은 시드면 장애물 코스가 프레임 단위로 일치한다', () => {
    const { log } = playAndRecord(555);
    const live = new GameSim(555);
    const ghost = new GhostDriver(log);
    // 입력이 달라도(라이브는 무입력) 장애물 스폰은 시드+프레임만의 함수여야 한다
    for (let i = 0; i < 300; i++) {
      live.step();
      ghost.step();
    }
    const liveObs = live.state.obstacles.map((o) => ({ a: o.active, x: o.x, h: o.h }));
    const ghostObs = ghost.sim.state.obstacles.map((o) => ({ a: o.active, x: o.x, h: o.h }));
    expect(ghostObs).toEqual(liveObs);
  });
});
