import { describe, expect, test } from 'vitest';
import { GameSim, replay } from '../sim';
import { GhostDriver } from '../ghost';
import {
  createInputLog,
  recordTap,
  recordRevive,
  parseLog,
  serializeLog,
} from '../inputLog';
import * as C from '../constants';

describe('GameSim.revive', () => {
  test('gameOver=true → HP/무적/콤보/피버/점프 초기화 + EV_REVIVE', () => {
    const sim = new GameSim(1);
    while (!sim.state.gameOver) sim.step();
    expect(sim.state.gameOver).toBe(true);
    const frameAtDeath = sim.state.frame;

    sim.revive();
    expect(sim.state.gameOver).toBe(false);
    expect(sim.state.hp).toBe(C.HP_MAX);
    expect(sim.state.combo).toBe(0);
    expect(sim.state.feverFramesLeft).toBe(0);
    expect(sim.state.player.jumpsUsed).toBe(0);
    expect(sim.state.player.vy).toBe(0);
    expect(sim.state.invincibleFrames).toBe(
      Math.round(C.REVIVE_INVINCIBLE_SEC * C.SIM_FPS),
    );
    expect(sim.state.frame).toBe(frameAtDeath);

    sim.step();
    expect(sim.state.events & C.EV_REVIVE).toBeTruthy();
  });

  test('gameOver=false → early return', () => {
    const sim = new GameSim(1);
    sim.step();
    const hp = sim.state.hp;
    sim.revive();
    expect(sim.state.hp).toBe(hp);
    expect(sim.state.events & C.EV_REVIVE).toBe(0);
  });
});

describe('inputLog revive', () => {
  test('parseLog가 revive를 허용하고 미지 타입은 거부', () => {
    const log = createInputLog(7);
    recordTap(log, 10);
    recordRevive(log, 20);
    const restored = parseLog(serializeLog(log));
    expect(restored.events).toEqual([
      { frame: 10, type: 'tap' },
      { frame: 20, type: 'revive' },
    ]);
    expect(() =>
      parseLog(
        JSON.stringify({
          version: log.version,
          seed: 7,
          events: [{ frame: 1, type: 'warp' }],
        }),
      ),
    ).toThrow(/스키마/);
  });

  test('recordRevive 프레임 역행 거부', () => {
    const log = createInputLog(1);
    recordTap(log, 10);
    expect(() => recordRevive(log, 5)).toThrow(/역행/);
  });
});

describe('GhostDriver revive', () => {
  test('부활 포함 로그: finished가 첫 사망에서 false, 최종에서 true', () => {
    const seed = 4242;
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
    const deathFrame = sim.state.frame;
    recordRevive(log, deathFrame);
    sim.revive();
    // 짧게 더 뛰고 다시 죽게 둠
    guard = 0;
    while (!sim.state.gameOver && guard++ < 5000) {
      if (sim.state.frame % 40 === 0) {
        recordTap(log, sim.state.frame);
        sim.queueTap();
      }
      sim.step();
    }
    const finalFrame = sim.state.frame;

    const ghost = new GhostDriver(log);
    // 첫 사망 프레임까지
    while (ghost.sim.state.frame < deathFrame && !ghost.finished) ghost.step();
    expect(ghost.sim.state.gameOver).toBe(true);
    expect(ghost.finished).toBe(false); // revivesLeft > 0

    while (!ghost.finished && ghost.sim.state.frame < finalFrame + 10) ghost.step();
    expect(ghost.finished).toBe(true);
    expect(ghost.sim.state.frame).toBe(finalFrame);

    const batch = replay(log, finalFrame);
    expect(JSON.stringify(ghost.sim.state)).toBe(JSON.stringify(batch.state));
  });

  test('finished 후 step no-op — 부활 소진 후에만', () => {
    const { log } = (() => {
      const seed = 99;
      const sim = new GameSim(seed);
      const log = createInputLog(seed);
      let g = 0;
      while (!sim.state.gameOver && g++ < 20000) {
        if (sim.state.frame % 50 === 0 && sim.state.frame > 0) {
          recordTap(log, sim.state.frame);
          sim.queueTap();
        }
        sim.step();
      }
      return { log };
    })();
    const ghost = new GhostDriver(log);
    let guard = 0;
    while (!ghost.finished && guard++ < 25000) ghost.step();
    const frozen = JSON.stringify(ghost.sim.state);
    ghost.step();
    expect(JSON.stringify(ghost.sim.state)).toBe(frozen);
  });
});
