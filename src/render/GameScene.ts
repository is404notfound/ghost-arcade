// Phaser 3 렌더 레이어 — sim 상태의 '읽기 전용' 소비자 (D1).
//
//   pointerdown ──► recordTap + queueTap ──► [GameSim] ◄── FixedTimestep이 DT 단위로 step()
//                                               │
//                          syncVisuals()가 매 렌더 프레임 state를 '읽어서' 그림
//
// 철칙: 이 파일은 sim.state를 절대 변경하지 않는다. 게임 로직이 여기로 새는 순간
// 입력 로그만으로 게임을 복원할 수 없게 되어 골든 리플레이(T4)가 깨진다.
import Phaser from 'phaser';
import * as Sentry from '@sentry/browser';
import { GameSim } from '../sim/sim';
import { GhostDriver } from '../sim/ghost';
import { FixedTimestep } from '../sim/timestep';
import * as C from '../sim/constants';
import { createInputLog, recordTap, serializeLog, SIM_VERSION, type InputLog } from '../sim/inputLog';
import { dailySeed } from '../dailySeed';
import { saveRun, loadTopRuns, GHOST_TOP_N, type GhostRecord } from '../ghostStore';
import { loadTopRunsRemote, submitRunRemote } from '../remoteStore';
import { compareGhosts, type GhostComparison } from './ghostCompare';
import { DESIGN_W, DESIGN_H, GROUND_Y_PX, toScreenX, toScreenY, boxCenterScreenY } from './viewport';
import { registerPauseToggle, setPauseButtonState } from '../controls';
import { track } from '../analytics';

const COLOR_PLAYER = 0x64ffda;
const COLOR_GHOST = 0xb39ddb; // 고스트 — 보라 계열 반투명
const COLOR_OBSTACLE = 0xff6b6b;
const COLOR_POTION = 0x4dabf7;
const COLOR_GROUND = 0x8892b0;
const GHOST_ALPHA = 0.22;
const DEAD_PLAYER_ALPHA = 0.25; // 사망 후 구경 모드에서 내 캐릭터 디밍
const SPECTATE_MAX_SEC = 3; // 사망 후 구경 최대 시간

export class GameScene extends Phaser.Scene {
  private sim!: GameSim;
  private log!: InputLog;
  private timestep!: FixedTimestep;
  private seed = 0;
  // 오늘 상위 N개 기록의 유령들 — 없으면 빈 배열 (그날 첫 판)
  private ghosts: GhostDriver[] = [];
  // 판 시작 시점의 고스트 최종 거리들 (비교 기준 — 이번 판 저장 전에 캡처)
  private ghostDistances: number[] = [];
  // 이번 판에서 내가 살아있는 동안 죽은(=제친) 고스트 수
  private overtakenLive = 0;
  // 마지막으로 완료된 원격 로드 결과 — 다음 판 startRun()에서 사용
  private remoteRuns: GhostRecord[] = [];

  // 구경 모드: 내가 죽어도 살아있는 유령들이 격차를 벌리는 걸 보여주는 구간
  private spectating = false;
  private spectateFramesLeft = 0;
  private pendingCmp: GhostComparison | null = null; // 보류된 결과 패널 데이터
  private pendingMyDist = 0;

  private paceText!: Phaser.GameObjects.Text; // 현재 등수 "N / M등"
  private overtakeHudText!: Phaser.GameObjects.Text; // "제침 X/N"
  private comboDisplay!: Phaser.GameObjects.Text; // 화면 중앙 큰 콤보 숫자 (combo >= 2)
  private prevCombo = 0; // 이전 프레임 combo 값 — 증가 감지용
  private prevRank = 0;  // 이전 프레임 등수 — 상승 감지용
  private feverCount = 0; // 이번 판 피버 발동 횟수 — game_over 이벤트용
  private crashed = false; // 렌더 루프 예외 발생 시 1회만 보고하고 정지 (이벤트 폭주 방지)
  private gamePaused = false;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private _windowTapHandler!: () => void;
  private feverOverlay!: Phaser.GameObjects.Rectangle; // 피버 중 warm tint 레이어
  private infiniteJumpText!: Phaser.GameObjects.Text; // 피버 중 "클릭시 무한 회복!" 안내
  private spectateHintText!: Phaser.GameObjects.Text; // 구경 중 "탭하여 건너뛰기" 안내

  // 고스트 스프라이트 풀 — GHOST_TOP_N개를 create()에서 한 번만 생성 (D6)
  private ghostRects: Phaser.GameObjects.Rectangle[] = [];
  private playerRect!: Phaser.GameObjects.Rectangle;
  // sim의 고정 크기 풀과 1:1 매핑 — 생성은 create()에서 단 한 번 (D6)
  private obstacleRects: Phaser.GameObjects.Rectangle[] = [];
  private potionCircles: Phaser.GameObjects.Arc[] = [];

  private hpFill!: Phaser.GameObjects.Rectangle;
  private distText!: Phaser.GameObjects.Text;
  private gameOverPanel!: Phaser.GameObjects.Container;
  private gameOverDistText!: Phaser.GameObjects.Text;
  private comparisonText!: Phaser.GameObjects.Text; // 신기록/뒤짐 비교 한 줄
  private overtakeText!: Phaser.GameObjects.Text; // "고스트 K/N 제침"
  private hintText!: Phaser.GameObjects.Text; // "탭하여 재시작" / "한 판 더?"

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.startRun();

    // 바닥 띠 (지면 선 아래)
    this.add
      .rectangle(DESIGN_W / 2, (GROUND_Y_PX + DESIGN_H) / 2, DESIGN_W, DESIGN_H - GROUND_Y_PX, COLOR_GROUND);

    // 고스트 풀 (플레이어보다 먼저 그려서 뒤에 깔림)
    for (let i = 0; i < GHOST_TOP_N; i++) {
      const g = this.add
        .rectangle(
          toScreenX(C.PLAYER_X),
          boxCenterScreenY(0, C.PLAYER_H),
          C.PLAYER_W,
          C.PLAYER_H,
          COLOR_GHOST,
        )
        .setAlpha(GHOST_ALPHA)
        .setVisible(false);
      this.ghostRects.push(g);
    }

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

    // 피버 오버레이 — 피버 중 화면 전체에 황금빛 tint (HUD보다 먼저 생성 → 그 아래 렌더)
    this.feverOverlay = this.add
      .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0xffd700)
      .setAlpha(0.12)
      .setVisible(false);

    // 피버 중 점프=회복 안내 — 피버 활성 시 표시, 끝나면 사라짐
    this.infiniteJumpText = this.add
      .text(DESIGN_W / 2, 178, '클릭시 무한 회복!', {
        fontSize: '22px',
        color: '#ffd700',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 5)
      .setAlpha(0.9)
      .setVisible(false)
      .setDepth(10);

    // 구경 모드 안내 — 내가 죽은 뒤 유령들이 계속 달리는 동안 탭으로 건너뛸 수 있음을 알림
    this.spectateHintText = this.add
      .text(DESIGN_W / 2, DESIGN_H * 0.78, 'GAME OVER\n탭하여 건너뛰기', {
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 6)
      .setAlpha(0.85)
      .setVisible(false);

    // HUD: 체력바(상단 중앙) + 거리(우상단) + 콤보(좌상단)
    const barW = 220, barH = 14;
    this.add.rectangle(DESIGN_W / 2, 28, barW + 4, barH + 4, 0x000000, 0.5);
    this.hpFill = this.add
      .rectangle(DESIGN_W / 2 - barW / 2, 28, barW, barH, 0x2ecc71)
      .setOrigin(0, 0.5);
    this.distText = this.add
      .text(DESIGN_W - 16, 16, '0M', { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(1, 0);
    // 플레이어 머리 위를 따라다니는 격차 텍스트 (고스트 없으면 숨김).
    // 어두운 배경/장애물 위에서도 읽히도록 외곽선을 깐다
    this.paceText = this.add
      .text(toScreenX(C.PLAYER_X), 0, '', { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5, 1)
      .setStroke('#1a1a2e', 4)
      .setVisible(false);
    // 콤보 아래: 생존 기반 제침 카운터 (고스트 없으면 숨김)
    this.overtakeHudText = this.add
      .text(16, 34, '', { fontSize: '15px', color: '#b39ddb', fontStyle: 'bold' })
      .setOrigin(0, 0)
      .setVisible(false);
    // 화면 중앙 큰 콤보 숫자 — combo >= 2 일 때만 표시, 플레이 레인 위쪽에 배치
    this.comboDisplay = this.add
      .text(DESIGN_W / 2, 130, '', {
        fontSize: '50px',
        color: '#ffd166',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0.8)
      .setStroke('#1a1a2e', 6)
      .setVisible(false)
      .setDepth(10);

    // 게임오버 패널 (숨김 상태로 미리 생성)
    const goBg = this.add.rectangle(0, 0, 340, 200, 0x000000, 0.72);
    const goTitle = this.add
      .text(0, -70, 'GAME OVER', { fontSize: '30px', color: '#ff4757', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.gameOverDistText = this.add
      .text(0, -28, '', { fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5);
    this.comparisonText = this.add
      .text(0, 2, '', { fontSize: '17px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.overtakeText = this.add
      .text(0, 28, '', { fontSize: '15px', color: '#b39ddb' })
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 64, '탭하여 재시작', { fontSize: '15px', color: '#aaaaaa' })
      .setOrigin(0.5);
    this.gameOverPanel = this.add
      .container(DESIGN_W / 2, DESIGN_H * 0.42, [
        goBg,
        goTitle,
        this.gameOverDistText,
        this.comparisonText,
        this.overtakeText,
        this.hintText,
      ])
      .setVisible(false);

    // 일시정지 오버레이 — 게임오버 패널 위에 렌더되도록 마지막에 생성
    const poBg = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x000000, 0.55);
    const poText = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2, '일시정지\n탭하여 계속', {
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 6);
    this.pauseOverlay = this.add.container(0, 0, [poBg, poText]).setVisible(false);

    registerPauseToggle(() => { this.togglePause(); });

    // 화면 어디를 탭해도 점프 — 캔버스 밖 빈 공간(좌우 기둥)도 포함
    // #fs-btn은 pointerdown에서 stopPropagation → 이 핸들러까지 버블되지 않음
    this._windowTapHandler = () => { this.onTap(); };
    window.addEventListener('pointerdown', this._windowTapHandler, { passive: true });
    this.events.once('shutdown', () => {
      window.removeEventListener('pointerdown', this._windowTapHandler);
    });

    // Space·ArrowUp도 같은 onTap 경로 — e.repeat는 꾹 누름 자동반복이라 한 번만 처리
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === ' ' || event.key === 'ArrowUp') {
        event.preventDefault(); // 스페이스 스크롤 방지
        this.onTap();
      }
    });
  }

  /** 새 판 시작 — 데일리 시드(오늘의 코스) + 저장된 최고 기록 유령 로드.
   *  isRetry=true면 게임오버 후 자발적 재시작(첫 진입과 구분). */
  private startRun(isRetry = false) {
    this.seed = dailySeed(); // 같은 날 = 같은 코스 (TODOS 시드 공유 → 데일리 시드로 결정)
    this.sim = new GameSim(this.seed);
    this.log = createInputLog(this.seed);
    this.timestep = new FixedTimestep(C.DT * 1000);

    // 원격 → 로컬 순서로 폴백: 크로스유저 고스트 우선, 없으면 셀프 고스트
    const localRecords = loadTopRuns(window.localStorage, this.seed);
    const records = this.remoteRuns.length > 0 ? this.remoteRuns : localRecords;
    this.ghosts = records.map((r) => new GhostDriver(r.log));
    this.ghostDistances = records.map((r) => r.distance);
    this.overtakenLive = 0;
    this.spectating = false;
    this.pendingCmp = null;
    this.prevCombo = 0;
    this.prevRank = this.ghosts.length + 1;
    this.feverCount = 0;
    console.log(`[ghost-arcade] 시드 ${this.seed}, 유령 ${this.ghosts.length}기 로드 (원격 ${this.remoteRuns.length}기)`);
    // is_retry로 첫 시작/재시작 구분 → 자발적 재시도율 = is_retry=true 비율.
    // 별도 retry 이벤트는 제거(game_start와 중복이었음).
    track('game_start', { seed: this.seed, ghost_count: this.ghosts.length, is_retry: isRetry });

    // 다음 판을 위해 원격 데이터를 백그라운드로 갱신
    const currentSeed = this.seed;
    void loadTopRunsRemote(currentSeed).then((remote) => {
      this.remoteRuns = remote;
      // 새 기기 첫 판 UX: 고스트 없이 시작했고(ghosts.length===0) 원격 데이터가
      // 게임 시작 3초 이내(SIM_FPS*3 프레임)에 도착했으면 현재 판에도 즉시 적용.
      // Supabase 왕복이 보통 <1s이므로 대부분의 첫 판에서 고스트가 출현한다.
      if (remote.length > 0 && this.ghosts.length === 0 && this.sim.state.frame < C.SIM_FPS * 3) {
        this.ghosts = remote.map((r) => new GhostDriver(r.log));
        this.ghostDistances = remote.map((r) => r.distance);
        this.prevRank = this.ghosts.length + 1;
      }
      // 원격·로컬 모두 비어있으면 봇 콜드스타트 업로드 (B4)
      if (remote.length === 0 && localRecords.length === 0) {
        void this.uploadBotColdStart(currentSeed);
      }
    });

    this.gamePaused = false;
    if (this.gameOverPanel) this.gameOverPanel.setVisible(false);
    if (this.comboDisplay) this.comboDisplay.setVisible(false);
    if (this.feverOverlay) this.feverOverlay.setVisible(false);
    if (this.infiniteJumpText) this.infiniteJumpText.setVisible(false);
    if (this.spectateHintText) this.spectateHintText.setVisible(false);
    if (this.pauseOverlay) this.pauseOverlay.setVisible(false);
    setPauseButtonState(false, true);
  }

  /** 원격에 기록이 없을 때 봇 로그를 1회 업로드한다 — localStorage 플래그로 중복 방지 */
  private async uploadBotColdStart(seed: number): Promise<void> {
    const flagKey = `ga:bots:v${SIM_VERSION}:${seed}`;
    try {
      if (window.localStorage.getItem(flagKey)) return;
    } catch {
      return; // localStorage 접근 실패 = 스킵
    }
    const { recordAllBotRuns } = await import('../botRecorder');
    const botRuns = recordAllBotRuns(seed);
    for (const { log, distance } of botRuns) {
      await submitRunRemote(seed, log, distance, true);
    }
    try { window.localStorage.setItem(flagKey, '1'); } catch { /* 무시 */ }
  }

  private onTap() {
    // 일시정지 중 탭 = 재개 (점프로 기록 안 됨 — 결정론 경계 유지)
    if (this.gamePaused) {
      this.togglePause();
      return;
    }
    if (this.spectating) {
      // 구경 중 탭 = 구경 즉시 종료 → 결과 패널 표시 (재시작 아님)
      this.spectating = false;
      this.spectateFramesLeft = 0;
      this.spectateHintText.setVisible(false);
      if (this.pendingCmp !== null) this.showResultPanel(this.pendingCmp, this.pendingMyDist);
      return;
    }
    if (this.sim.state.gameOver) {
      // 결과 패널 표시 상태에서 탭 = 자발적 재시작 (game_start에 is_retry=true로 기록)
      this.startRun(true);
      return;
    }
    // 기록 먼저, 큐잉 다음 — 같은 frame 값을 공유해야 재생이 일치한다
    recordTap(this.log, this.sim.state.frame);
    this.sim.queueTap();
  }

  private togglePause(): void {
    this.gamePaused = !this.gamePaused;
    if (!this.gamePaused) {
      this.timestep.reset(); // 재개: 멈춘 동안 쌓인 delta → burst-step 방지
    }
    this.pauseOverlay.setVisible(this.gamePaused);
    setPauseButtonState(this.gamePaused, true);
  }

  update(_time: number, delta: number) {
    // 매 프레임 도는 핫 루프 — 같은 예외가 초당 수십 번 Sentry로 폭주하는 걸 막기 위해
    // 한 번 터지면 보고 1회 후 루프를 정지시킨다 (Sentry 기본 dedupe보다 확실한 차단).
    if (this.crashed) return;
    try {
      this.tick(delta);
    } catch (e) {
      this.crashed = true;
      Sentry.captureException(e);
      console.error('[ghost-arcade] 렌더 루프 크래시 — 정지', e);
    }
  }

  private tick(delta: number) {
    if (!this.gamePaused) {
      // 렌더 fps가 어떻든 시뮬은 DT 단위로만 전진 (결정론 경계)
      this.timestep.update(delta, () => {
        this.sim.step();
        // 유령들은 라이브와 lockstep. 내가 죽은 뒤에는 '구경 모드'에서만 계속 달리고,
        // 결과 패널이 뜨면 함께 멈춘다.
        if (!this.sim.state.gameOver || this.spectating) {
          for (const g of this.ghosts) {
            const wasFinished = g.finished;
            g.step();
            // 유령이 죽는 순간(finished 전환) = 내가 그 기록보다 오래 버팀 = 제침
            if (!wasFinished && g.finished && !this.sim.state.gameOver) {
              this.overtakenLive++;
              this.popup('고스트 제침!', '#b39ddb');
            }
          }
        }
        this.handleStepEvents(this.sim.state.events);

        // 구경 종료: 유령 전멸 or 시간 만료 → 보류해둔 결과 패널 표시
        if (this.spectating) {
          this.spectateFramesLeft--;
          const allDead = this.ghosts.every((g) => g.finished);
          if (this.spectateFramesLeft <= 0 || allDead) {
            console.log(
              `[ghost-arcade] 구경 종료: ${allDead ? '유령 전멸' : '시간 만료'} (잔여 ${this.spectateFramesLeft}f)`,
            );
            this.spectating = false;
            this.spectateHintText.setVisible(false);
            if (this.pendingCmp !== null) this.showResultPanel(this.pendingCmp, this.pendingMyDist);
          }
        }
      });
    }
    this.syncVisuals();
  }

  /** 코어가 뱉은 이벤트 비트마스크 → 연출 트리거 (스텝당 1회) */
  private handleStepEvents(ev: number) {
    if (ev & C.EV_HIT) {
      this.cameras.main.flash(140, 255, 70, 70);
    }
    if (ev & C.EV_COMBO_BREAK) {
      // 콤보가 끊긴 순간 — 화면 흔들림 + 빨간 팝업
      this.cameras.main.shake(90, 0.005);
      this.popup('BREAK', '#ff4757');
    }
    if (ev & C.EV_POTION) {
      this.popup('+HP', '#4dabf7');
    }
    if (ev & C.EV_FEVER_START) {
      this.feverCount++;
      this.cameras.main.flash(200, 255, 215, 0); // 황금빛 노란 플래시 (피격 빨강과 구분)
      this.feverOverlay.setVisible(true);
      // 큰 FEVER! 연출 — popup()보다 크게 직접 생성
      const fx = DESIGN_W / 2;
      const fy = DESIGN_H * 0.45;
      const ft = this.add
        .text(fx, fy, 'FEVER!', {
          fontSize: '90px',
          color: '#ffd700',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setStroke('#1a1a2e', 12);
      this.tweens.add({
        targets: ft,
        y: fy - 70,
        alpha: 0,
        scaleX: 1.6,
        scaleY: 1.6,
        duration: 950,
        ease: 'Cubic.out',
        onComplete: () => ft.destroy(),
      });
    }
    if (ev & C.EV_FEVER_END) {
      this.feverOverlay.setVisible(false);
    }
    if (ev & C.EV_GAME_OVER) {
      setPauseButtonState(false, false); // 게임오버 → 일시정지 버튼 숨김
      const myDist = this.sim.state.distance;
      track('game_over', {
        distance: Math.floor(myDist),
        rank: this.ghosts.length - this.overtakenLive + 1,
        ghost_count: this.ghosts.length,
        duration_frames: this.sim.state.frame,
        fever_count: this.feverCount,
      });
      // 비교 먼저 (판 시작 시점 기록 기준) → 저장은 그 다음
      const cmp = compareGhosts(myDist, this.ghostDistances);
      saveRun(window.localStorage, this.seed, this.log, myDist);
      // 원격 제출 — fire-and-forget: 실패해도 로컬 기록은 보존된다
      void submitRunRemote(this.seed, this.log, myDist);
      // 골든 리플레이/고스트 재료 — 이 로그와 시드만 있으면 이 판 전체가 복원된다
      console.log('[ghost-arcade] 입력 로그:', serializeLog(this.log));

      // 살아있는 유령이 있으면 구경 모드: 격차가 벌어지는 걸 보여준 뒤 결과 표시.
      // 유령이 없거나 전부 제쳤으면(신기록) 바로 결과.
      const alive = this.ghosts.filter((g) => !g.finished).length;
      console.log(`[ghost-arcade] 사망 frame=${this.sim.state.frame}, 생존 유령 ${alive}/${this.ghosts.length}`);
      if (alive > 0) {
        this.spectating = true;
        this.spectateFramesLeft = SPECTATE_MAX_SEC * C.SIM_FPS;
        this.pendingCmp = cmp;
        this.pendingMyDist = myDist;
        this.spectateHintText.setVisible(true);
      } else {
        this.showResultPanel(cmp, myDist);
      }
    }
  }

  /** 보류됐던 결과 패널 채우기 + 표시 (사망 즉시 or 구경 종료 후) */
  private showResultPanel(cmp: GhostComparison, myDist: number) {
    this.gameOverDistText.setText(`거리  ${Math.floor(myDist)}M`);

    if (!cmp.hasGhosts) {
      // 그날 첫 판 — 비교할 상대가 없다
      this.comparisonText.setText('');
      this.overtakeText.setText('');
      this.hintText.setText('탭하여 재시작');
    } else if (cmp.isRecord) {
      this.comparisonText.setText(`🏆 신기록! 이전 최고 +${cmp.diffM}M`).setColor('#ffd166');
      const finalRank1 = cmp.total - cmp.overtaken + 1;
      this.overtakeText.setText(`최종 ${finalRank1}/${cmp.total + 1}등  ·  제침 ${cmp.overtaken}/${cmp.total}`);
      this.hintText.setText('탭하여 재시작');
    } else {
      this.comparisonText
        .setText(`고스트에게 ${cmp.diffM}M 뒤짐`)
        .setColor(cmp.isClose ? '#ff8787' : '#aaaaaa');
      const finalRank2 = cmp.total - cmp.overtaken + 1;
      this.overtakeText.setText(`최종 ${finalRank2}/${cmp.total + 1}등  ·  제침 ${cmp.overtaken}/${cmp.total}`);
      // 박빙이면 재시도를 직접 꼬신다
      this.hintText.setText(cmp.isClose ? '한 판 더?' : '탭하여 재시작');
    }

    this.gameOverPanel.setVisible(true);
  }

  /** sim.state → 화면 동기화. 읽기만 한다. */
  private syncVisuals() {
    const s = this.sim.state;

    // 월드(장애물/포션/거리)의 렌더 기준: 평소엔 내 sim, 구경 모드에선 살아있는
    // 유령 sim — 같은 시드라 어느 sim이든 코스·거리가 프레임 단위로 동일하다
    const aliveGhost = this.spectating ? this.ghosts.find((g) => !g.finished) : undefined;
    const world = aliveGhost !== undefined ? aliveGhost.sim.state : s;

    // 플레이어 (무적 중엔 시뮬 프레임 기반 깜빡임, 죽으면 그 자리에서 디밍)
    this.playerRect.setY(boxCenterScreenY(s.player.y, C.PLAYER_H));
    this.playerRect.setAlpha(
      s.gameOver ? DEAD_PLAYER_ALPHA : s.invincibleFrames > 0 ? (s.frame % 8 < 4 ? 0.35 : 0.85) : 1,
    );

    // 고스트들: 위치만 그린다 (장애물은 코스 공유라 불필요).
    for (let i = 0; i < GHOST_TOP_N; i++) {
      const rect = this.ghostRects[i]!;
      const g = this.ghosts[i];
      rect.setVisible(g !== undefined && !g.finished);
      if (g !== undefined) {
        rect.setY(boxCenterScreenY(g.sim.state.player.y, C.PLAYER_H));
      }
    }

    // 장애물/포션: active만 보이게, 위치 갱신 (객체 생성/파괴 없음)
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = world.obstacles[i]!;
      const r = this.obstacleRects[i]!;
      r.setVisible(o.active);
      if (o.active) {
        r.setDisplaySize(o.w, o.h);
        r.setPosition(toScreenX(o.x), boxCenterScreenY(0, o.h));
      }
    }
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = world.potions[i]!;
      const c = this.potionCircles[i]!;
      c.setVisible(p.active);
      if (p.active) c.setPosition(toScreenX(p.x), toScreenY(p.y));
    }

    // HUD
    const ratio = s.hp / C.HP_MAX;
    this.hpFill.scaleX = ratio;
    this.hpFill.setFillStyle(ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf1c40f : 0xff4757);
    // 거리 HUD: 구경 모드면 살아있는 유령 기준으로 계속 오른다 (격차 시각화)
    this.distText.setText(`${Math.floor(world.distance)}M`);

    // 중앙 큰 콤보 — 2 이상일 때, 게임오버/구경 중엔 숨김.
    const showCombo = s.combo >= 2 && !s.gameOver;
    this.comboDisplay.setVisible(showCombo);
    if (showCombo) {
      this.comboDisplay.setText(`${s.combo} combo`);
      // 피버 대기 중: 연한 금색. 피버 활성 중: 밝은 황금 (오버레이와 통일)
      this.comboDisplay.setColor(s.feverFramesLeft > 0 ? '#ffd700' : '#ffd166');
      // 피버 타이머 진행도로 스케일 — 피버 중: 최대, 평시: 타이머 비율(0→1) × 최대
      const timerRatio = s.feverFramesLeft > 0
        ? 1
        : s.feverTimerFrames / Math.round(C.FEVER_INTERVAL_SEC * C.SIM_FPS);
      const growthScale = 1 + timerRatio * 1.2;
      // 화면 폭의 80%를 넘지 않도록 클램프 (자릿수 증가 시에도 안전)
      const maxScale = (DESIGN_W * 0.8) / Math.max(1, this.comboDisplay.width);
      const targetScale = Math.min(growthScale, maxScale);
      if (s.combo > this.prevCombo) {
        // 콤보 증가 순간: 목표 배율보다 15% 크게 튀어올랐다 수렴
        this.tweens.killTweensOf(this.comboDisplay);
        this.comboDisplay.setScale(targetScale * 1.15);
        this.tweens.add({
          targets: this.comboDisplay,
          scaleX: targetScale,
          scaleY: targetScale,
          duration: 200,
          ease: 'Back.out',
        });
      } else if (!this.tweens.isTweening(this.comboDisplay)) {
        this.comboDisplay.setScale(targetScale);
      }
    }
    this.prevCombo = s.combo;

    // 피버 중 무한 점프 안내 — 게임 진행 중 피버 활성 시에만 표시
    this.infiniteJumpText.setVisible(s.feverFramesLeft > 0 && !s.gameOver);

    // 등수 HUD — 고스트 없는 첫 판이면 숨김, 게임오버 후엔 최종 등수를 유지
    const hasGhosts = this.ghosts.length > 0;
    const aliveGhosts = this.ghosts.length - this.overtakenLive;
    const currentRank = aliveGhosts + 1;
    const totalRunners = this.ghosts.length + 1;
    this.paceText.setVisible(hasGhosts);
    this.overtakeHudText.setVisible(hasGhosts && !s.gameOver);
    this.distText.setColor(this.spectating ? '#b39ddb' : '#ffffff');
    if (hasGhosts) {
      const is1st = currentRank === 1;
      this.paceText.setColor(is1st ? '#ffd700' : '#ffffff');
      this.paceText.setText(`${currentRank} / ${totalRunners}등`);
      this.paceText.setY(toScreenY(s.player.y + C.PLAYER_H) - 6);
      if (!s.gameOver) {
        this.overtakeHudText.setText(`제침 ${this.overtakenLive}/${this.ghosts.length}`);
        if (currentRank < this.prevRank) {
          this.tweens.killTweensOf(this.paceText);
          this.paceText.setScale(1.4);
          this.tweens.add({ targets: this.paceText, scaleX: 1, scaleY: 1, duration: 250, ease: 'Back.out' });
        }
      }
    }
    this.prevRank = currentRank;
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
