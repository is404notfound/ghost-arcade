// 시뮬 코어 헤드리스 데모 — 화면 없이 한 판을 돌려서 콘솔로 관전한다.
// 실행: npx tsx scripts/sim-demo.ts [시드]
import { GameSim } from '../src/sim/sim';
import { SIM_FPS, EV_HIT, EV_NEAR_MISS, EV_POTION } from '../src/sim/constants';

const seed = Number(process.argv[2] ?? 12345);
const sim = new GameSim(seed);

console.log(`시드 ${seed}로 시작 — 45프레임(0.75초)마다 탭하는 단순 봇\n`);

let guard = 0;
while (!sim.state.gameOver && guard++ < 60 * SIM_FPS) {
  // 아주 단순한 봇: 주기적으로 탭
  if (sim.state.frame % 45 === 0) sim.queueTap();
  sim.step();

  const ev = sim.state.events;
  const sec = (sim.state.frame / SIM_FPS).toFixed(2);
  if (ev & EV_HIT) console.log(`[${sec}s] 충돌! 체력 ${sim.state.hp.toFixed(0)}`);
  if (ev & EV_NEAR_MISS) console.log(`[${sec}s] 니어미스! 콤보 x${sim.state.nearMissCombo}`);
  if (ev & EV_POTION) console.log(`[${sec}s] 포션 획득! 체력 ${sim.state.hp.toFixed(0)}`);
}

const s = sim.state;
console.log(`\n게임오버 — 생존 ${(s.frame / SIM_FPS).toFixed(2)}초, 거리 ${Math.floor(s.distance)}M`);
console.log(`같은 시드로 다시 돌리면 늘 똑같은 결과가 나온다 (결정론).`);
