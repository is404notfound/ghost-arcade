// Phaser 3 렌더 레이어 — sim 상태의 '읽기 전용' 소비자 (D1).
//
//   pointerdown ──► recordTap + queueTap ──► [GameSim] ◄── FixedTimestep이 DT 단위로 step()
//                                               │
//                          syncVisuals()가 매 렌더 프레임 state를 '읽어서' 그림
//
// 철칙: 이 파일은 sim.state를 절대 변경하지 않는다. 게임 로직이 여기로 새는 순간
// 입력 로그만으로 게임을 복원할 수 없게 되어 골든 리플레이(T4)가 깨진다.
import Phaser from 'phaser';
import { GameSim } from '../sim/sim';
import { GhostDriver } from '../sim/ghost';
import { FixedTimestep } from '../sim/timestep';
import * as C from '../sim/constants';
import { createInputLog, recordTap, serializeLog, type InputLog } from '../sim/inputLog';
import { dailySeed } from '../dailySeed';
import { saveIfBest, loadBest } from '../ghostStore';
import { DESIGN_W, DESIGN_H, GROUND_Y_PX, toScreenX, toScreenY, boxCenterScreenY } from './viewport';

const COLOR_PLAYER = 0x64ffda;
const COLOR_GHOST = 0xb39ddb; // 고스트 — 보라 계열 반투명
const COLOR_OBSTACLE = 0xff6b6b;
const COLOR_POTION = 0x4dabf7;
const COLOR_GROUND = 0x8892b0;
const GHOST_ALPHA = 0.4;

export class GameScene extends Phaser.Scene {
  private sim!: GameSim;
  private log!: InputLog;
  private timestep!: FixedTimestep;
  private seed = 0;
  // 직전 최고 기록의 유령 — 없으면 null (그날 첫 판)
  private ghost: GhostDriver | null = null;

  private ghostRect!: Phaser.GameObjects.Rectangle;
  private playerRect!: Phaser.GameObjects.Rectangle;
  // sim의 고정 크기 풀과 1:1 매핑 — 생성은 create()에서 단 한 번 (D6)
  private obstacleRects: Phaser.GameObjects.Rectangle[] = [];
  private potionCircles: Phaser.GameObjects.Arc[] = [];

  private hpFill!: Phaser.GameObjects.Rectangle;
  private distText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private gameOverPanel!: Phaser.GameObjects.Container;
  private gameOverDistText!: Phaser.GameObjects.Text;
  private newRecordText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.startRun();

    // 바닥 띠 (지면 선 아래)
    this.add
      .rectangle(DESIGN_W / 2, (GROUND_Y_PX + DESIGN_H) / 2, DESIGN_W, DESIGN_H - GROUND_Y_PX, COLOR_GROUND);

    // 고스트 (플레이어보다 먼저 그려서 뒤에 깔림)
    this.ghostRect = this.add
      .rectangle(toScreenX(C.PLAYER_X), boxCenterScreenY(0, C.PLAYER_H), C.PLAYER_W, C.PLAYER_H, COLOR_GHOST)
      .setAlpha(GHOST_ALPHA)
      .setVisible(false);

    // 플레이어
    this.playerRect = this.add.rectangle(
      toScreenX(C.PLAYER_X),
      boxCenterScreenY(0, C.PLAYER_H),
      C.PLAYER_W,
      C.PLAYER_H,
      COLOR_PLAYER,
    );

    // 장애물/포션 스프라이트 풀 — sim 풀 인덱스와 1:1
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const r = this.add.rectangle(0, 0, C.OBS_W, 1, COLOR_OBSTACLE).setVisible(false);
      this.obstacleRects.push(r);
    }
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const c = this.add.circle(0, 0, C.POTION_R, COLOR_POTION).setVisible(false);
      this.potionCircles.push(c);
    }

    // HUD: 체력바(상단 중앙) + 거리(우상단) + 콤보(좌상단)
    const barW = 220, barH = 14;
    this.add.rectangle(DESIGN_W / 2, 28, barW + 4, barH + 4, 0x000000, 0.5);
    this.hpFill = this.add
      .rectangle(DESIGN_W / 2 - barW / 2, 28, barW, barH, 0x2ecc71)
      .setOrigin(0, 0.5);
    this.distText = this.add
      .text(DESIGN_W - 16, 16, '0M', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(1, 0);
    this.comboText = this.add
      .text(16, 16, '', { fontSize: '18px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0, 0);

    // 게임오버 패널 (숨김 상태로 미리 생성)
    const goBg = this.add.rectangle(0, 0, 320, 170, 0x000000, 0.72);
    const goTitle = this.add
      .text(0, -52, 'GAME OVER', { fontSize: '30px', color: '#ff4757', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.gameOverDistText = this.add
      .text(0, -8, '', { fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5);
    this.newRecordText = this.add
      .text(0, 20, '', { fontSize: '16px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5);
    const goHint = this.add
      .text(0, 52, '탭하여 재시작', { fontSize: '15px', color: '#aaaaaa' })
      .setOrigin(0.5);
    this.gameOverPanel = this.add
      .container(DESIGN_W / 2, DESIGN_H * 0.42, [goBg, goTitle, this.gameOverDistText, this.newRecordText, goHint])
      .setVisible(false);

    this.input.on('pointerdown', this.onTap, this);
  }

  /** 새 판 시작 — 데일리 시드(오늘의 코스) + 저장된 최고 기록 유령 로드 */
  private startRun() {
    this.seed = dailySeed(); // 같은 날 = 같은 코스 (TODOS 시드 공유 → 데일리 시드로 결정)
    this.sim = new GameSim(this.seed);
    this.log = createInputLog(this.seed);
    this.timestep = new FixedTimestep(C.DT * 1000);

    // 그날 시드의 최고 기록이 있으면 유령으로 — 같은 시드라 장애물 코스가 정렬된다
    const best = loadBest(window.localStorage, this.seed);
    this.ghost = best !== null ? new GhostDriver(best.log) : null;

    if (this.gameOverPanel) this.gameOverPanel.setVisible(false);
  }

  private onTap() {
    if (this.sim.state.gameOver) {
      this.startRun();
      return;
    }
    // 기록 먼저, 큐잉 다음 — 같은 frame 값을 공유해야 재생이 일치한다
    recordTap(this.log, this.sim.state.frame);
    this.sim.queueTap();
  }

  update(_time: number, delta: number) {
    // 렌더 fps가 어떻든 시뮬은 DT 단위로만 전진 (결정론 경계)
    this.timestep.update(delta, () => {
      this.sim.step();
      this.ghost?.step(); // 유령은 라이브와 lockstep — 같은 박자, 같은 코스
      this.handleStepEvents(this.sim.state.events);
    });
    this.syncVisuals();
  }

  /** 코어가 뱉은 이벤트 비트마스크 → 연출 트리거 (스텝당 1회) */
  private handleStepEvents(ev: number) {
    if (ev & C.EV_HIT) {
      this.cameras.main.flash(140, 255, 70, 70);
    }
    if (ev & C.EV_NEAR_MISS) {
      this.cameras.main.shake(90, 0.006);
      this.popup(`NICE! +${C.NEAR_MISS_HEAL}HP`, '#ffd166');
    }
    if (ev & C.EV_POTION) {
      this.popup('+HP', '#4dabf7');
    }
    if (ev & C.EV_GAME_OVER) {
      // 그날 최고 기록이면 저장 → 다음 판부터 이 판이 유령이 된다
      const isRecord = saveIfBest(window.localStorage, this.seed, this.log, this.sim.state.distance);
      this.gameOverDistText.setText(`거리  ${Math.floor(this.sim.state.distance)}M`);
      this.newRecordText.setText(isRecord ? '★ 오늘의 신기록 — 다음 판의 유령이 됩니다' : '');
      this.gameOverPanel.setVisible(true);
      // 골든 리플레이/고스트 재료 — 이 로그와 시드만 있으면 이 판 전체가 복원된다
      console.log('[ghost-arcade] 입력 로그:', serializeLog(this.log));
    }
  }

  /** sim.state → 화면 동기화. 읽기만 한다. */
  private syncVisuals() {
    const s = this.sim.state;

    // 플레이어 (무적 중엔 시뮬 프레임 기반 깜빡임 — 리플레이에서도 동일 연출)
    this.playerRect.setY(boxCenterScreenY(s.player.y, C.PLAYER_H));
    this.playerRect.setAlpha(s.invincibleFrames > 0 ? (s.frame % 8 < 4 ? 0.35 : 0.85) : 1);

    // 고스트: 있고 아직 안 죽었을 때만. 위치만 그린다 (장애물은 코스 공유라 불필요)
    const showGhost = this.ghost !== null && !this.ghost.finished;
    this.ghostRect.setVisible(showGhost);
    if (showGhost) {
      this.ghostRect.setY(boxCenterScreenY(this.ghost!.sim.state.player.y, C.PLAYER_H));
    }

    // 장애물/포션: active만 보이게, 위치 갱신 (객체 생성/파괴 없음)
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = s.obstacles[i]!;
      const r = this.obstacleRects[i]!;
      r.setVisible(o.active);
      if (o.active) {
        r.setDisplaySize(C.OBS_W, o.h);
        r.setPosition(toScreenX(o.x), boxCenterScreenY(0, o.h));
      }
    }
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = s.potions[i]!;
      const c = this.potionCircles[i]!;
      c.setVisible(p.active);
      if (p.active) c.setPosition(toScreenX(p.x), toScreenY(p.y));
    }

    // HUD
    const ratio = s.hp / C.HP_MAX;
    this.hpFill.scaleX = ratio;
    this.hpFill.setFillStyle(ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf1c40f : 0xff4757);
    this.distText.setText(`${Math.floor(s.distance)}M`);
    this.comboText.setText(s.nearMissCombo > 0 ? `NEAR x${s.nearMissCombo}` : '');
  }

  /** 위로 떠오르며 사라지는 팝업 — 이벤트 발생 시에만 생성 (프레임당 아님) */
  private popup(msg: string, color: string) {
    const x = toScreenX(C.PLAYER_X);
    const y = boxCenterScreenY(this.sim.state.player.y, C.PLAYER_H) - 44;
    const t = this.add.text(x, y, msg, { fontSize: '20px', color, fontStyle: 'bold' }).setOrigin(0.5);
    this.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.out',
      onComplete: () => t.destroy(),
    });
  }
}
