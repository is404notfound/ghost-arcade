// 고스트 드라이버 — 저장된 입력 로그를 라이브 sim과 lockstep으로 재생한다.
//
//   라이브 루프의 매 시뮬 스텝:   liveSim.step()  +  ghost.step()
//                                                       │
//                                  로그에서 현재 프레임의 탭을 먹이고 한 스텝 전진
//
// replay()(일괄)와 같은 계약(frame === state.frame일 때 queueTap)을 쓰므로
// 골든 리플레이 불변식이 lockstep에서도 유지된다 — 테스트가 이를 고정한다.
import { GameSim } from './sim';
import type { InputLog } from './inputLog';

export class GhostDriver {
  readonly sim: GameSim;
  private readonly log: InputLog;
  private cursor = 0;

  constructor(log: InputLog) {
    this.sim = new GameSim(log.seed);
    this.log = log;
  }

  /** 원본 플레이가 끝난 지점(게임오버)에 도달했는가 */
  get finished(): boolean {
    return this.sim.state.gameOver;
  }

  /** 라이브 sim과 같은 박자로 호출한다. finished 후엔 no-op. */
  step(): void {
    if (this.finished) return;
    const events = this.log.events;
    while (this.cursor < events.length && events[this.cursor]!.frame === this.sim.state.frame) {
      this.sim.queueTap();
      this.cursor++;
    }
    this.sim.step();
  }
}
