// 고스트 드라이버 — 저장된 입력 로그를 라이브 sim과 lockstep으로 재생한다.
//
//   라이브 루프의 매 시뮬 스텝:   liveSim.step()  +  ghost.step()
//                                                       │
//                                  로그에서 현재 프레임의 탭/부활을 먹이고 한 스텝 전진
//
// replay()(일괄)와 같은 계약(frame === state.frame일 때 queueTap/revive)을 쓰므로
// 골든 리플레이 불변식이 lockstep에서도 유지된다 — 테스트가 이를 고정한다.
import { GameSim } from './sim';
import type { InputLog } from './inputLog';

export class GhostDriver {
  readonly sim: GameSim;
  private readonly log: InputLog;
  private cursor = 0;
  /** 남은 부활 수 — finished가 gameOver만 보면 첫 사망에서 커서가 멈춰 revive를 못 먹음 */
  private revivesLeft: number;

  constructor(log: InputLog) {
    this.sim = new GameSim(log.seed);
    this.log = log;
    this.revivesLeft = log.events.reduce((n, e) => n + (e.type === 'revive' ? 1 : 0), 0);
  }

  /** 남은 부활이 있으면 아직 끝난 게 아니다 */
  get finished(): boolean {
    return this.sim.state.gameOver && this.revivesLeft === 0;
  }

  /** 라이브 sim과 같은 박자로 호출한다. finished 후엔 no-op. */
  step(): void {
    if (this.finished) return;
    const events = this.log.events;
    while (this.cursor < events.length && events[this.cursor]!.frame === this.sim.state.frame) {
      if (events[this.cursor]!.type === 'revive') {
        this.sim.revive();
        this.revivesLeft--;
      } else {
        this.sim.queueTap();
      }
      this.cursor++;
    }
    this.sim.step();
  }
}
