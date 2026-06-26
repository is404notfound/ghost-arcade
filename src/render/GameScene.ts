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

// 게임 에셋(전처리본 assets/game/*) — Vite가 해시 URL로 번들. scripts/prep-assets.py 산출물.
import playerRideUrl from '../../assets/game/player-ride.png';
import playerJumpUrl from '../../assets/game/player-jump.png';
import playerHitUrl from '../../assets/game/player-hit.png';
import playerDeadUrl from '../../assets/game/player-dead.png';
import ghostRun0Url from '../../assets/game/ghost-run-0.png';
import ghostRun1Url from '../../assets/game/ghost-run-1.png';
import fuelCanUrl from '../../assets/game/fuel-can.png';
import buildingCapUrl from '../../assets/game/building-cap.png';
import buildingFloorUrl from '../../assets/game/building-floor.png';
import bgSunUrl from '../../assets/game/bg-sun.png';
// 일본어 네온 간판 데코 (배경 패럴랙스 레이어)
import signYakouUrl from '../../assets/images/signage/signage-yakou.png';
import signHotelUrl from '../../assets/images/signage/signage-hotel.png';
import signMusicUrl from '../../assets/images/signage/signage-music-bar.png';
import signShinyaUrl from '../../assets/images/signage/signage-shinya.png';

const COLOR_GHOST = 0xb39ddb; // 고스트 — 보라 계열 반투명(스프라이트 틴트)

// 배경(코드 스킨) 팔레트 — neon-asset-spec.md §2 토큰. 전부 렌더 전용.
const COLOR_SKY_TOP = 0x170a2e;   // 하늘 상단(딥 인디고)
const COLOR_SKY_LOW = 0x6b1248;   // 지평선(마젠타-퍼플)
const COLOR_NEON_CYAN = 0x36f9f6; // 바닥 그리드 / 지평선 글로우
const COLOR_SKYLINE = 0x1b0c33;   // 먼 도시 실루엣
const COLOR_SKYLINE_WIN = 0xff6fb0; // 실루엣 창문 점
const COLOR_GROUND_DARK = 0x0a0612; // 지면(지평선 아래)
const SKYLINE_PARALLAX = 0.2;     // 먼 스카이라인 스크롤 배수(월드속도 대비)
const GRID_SPACING = 70;          // 바닥 그리드 수직선 간격(px)
const DEAD_PLAYER_ALPHA = 0.25; // 사망 후 구경 모드에서 내 캐릭터 디밍
const SPECTATE_MAX_SEC = 3; // 사망 후 구경 최대 시간
const SPECTATE_SPEED_MULT = 3; // 구경 모드에서 고스트 재생 배속

// 스프라이트 표시 튜닝 — 아트는 풋프린트(히트박스)보다 크게 overhang 허용(스펙 §1).
// 충돌은 sim의 직사각형 풋프린트로만 판정되므로 아래 값은 '보이는 크기'일 뿐이다.
const PLAYER_ART_H = 78;          // 라이더 표시 높이(px) — 히트박스 42 + 후드/스카프 overhang
const PLAYER_ART_ORIGIN_X = 0.62; // 아트 내 히트박스 정렬점(왼쪽 트레일 보정 → 우측 치우침)
const PLAYER_ART_ORIGIN_Y = 0.96; // 바퀴 접지점이 바닥선에 닿도록
const GHOST_ART_H = 60;           // 고스트 러너 표시 높이
const GHOST_SPRITE_ALPHA = 0.5;   // 디테일 실루엣이 읽히도록 도형(0.22)보다 높임
const BUILDING_ART_W = 42;        // 건물 표시 폭(루프/안테나 overhang 포함, 히트박스 32)
const FUEL_ART_SIZE = 32;         // 연료통 표시 한 변(px), 히트박스 26
const GHOST_RUN_FPS = 9;          // 고스트 달리기 2프레임 교차 속도(렌더 전용)

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
  // 인게임 안내
  private startOverlay!: Phaser.GameObjects.Container; // 판 시작마다 표시되는 오버레이
  private startBestRankText!: Phaser.GameObjects.Text; // 최고 등수 (이력 있으면 표시)
  private startSubText!: Phaser.GameObjects.Text;      // 고스트 경쟁 안내 / 첫판 조작 힌트
  private feverTutorial: Phaser.GameObjects.Container | null = null;  // 첫 피버 일시정지 안내
  private hasShownPotionHint = false;  // 첫 포션 획득 강조 (세션 1회)
  private needsFeverTutorial = true;   // 첫 피버 멈춤 튜토리얼 필요 여부
  private pauseOverlay!: Phaser.GameObjects.Container;
  private _windowTapHandler!: () => void;
  private feverOverlay!: Phaser.GameObjects.Rectangle; // 피버 중 warm tint 레이어
  private infiniteJumpText!: Phaser.GameObjects.Text; // 피버 중 "클릭시 무한 회복!" 안내
  private spectateHintText!: Phaser.GameObjects.Text; // 구경 중 "탭하여 건너뛰기" 안내
  private youDiedText!: Phaser.GameObjects.Text;      // 구경 모드 상단 "당신은 죽었습니다"

  // 고스트 스프라이트 풀 — GHOST_TOP_N개를 create()에서 한 번만 생성 (D6).
  // 발로 뛰는 헤일로 고스트(죽은 라이벌) 스프라이트, 보라 틴트 + 반투명.
  private ghostRects: Phaser.GameObjects.Sprite[] = [];
  private playerRect!: Phaser.GameObjects.Image; // 후드 라이더 + 네온 오토바이
  // sim의 고정 크기 풀과 1:1 매핑 — 생성은 create()에서 단 한 번 (D6)
  private obstacleRects: Phaser.GameObjects.Image[] = []; // 네온 건물(가변 높이)
  private fuelSprites: Phaser.GameObjects.Image[] = [];   // 연료통(회복=주유)

  // 배경 패럴랙스 레이어 (렌더 전용 — sim 무관, world.distance만 읽어 스크롤)
  private bgSkylineFar!: Phaser.GameObjects.Container;
  private groundGrid!: Phaser.GameObjects.Graphics;

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

  preload() {
    // 전처리된 게임 텍스처 로드 (Vite 해시 URL). 결정론과 무관한 렌더 자원.
    this.load.image('player-ride', playerRideUrl);
    this.load.image('player-jump', playerJumpUrl);
    this.load.image('player-hit', playerHitUrl);
    this.load.image('player-dead', playerDeadUrl);
    this.load.image('ghost-run-0', ghostRun0Url);
    this.load.image('ghost-run-1', ghostRun1Url);
    this.load.image('fuel-can', fuelCanUrl);
    this.load.image('building-cap', buildingCapUrl);
    this.load.image('building-floor', buildingFloorUrl);
    this.load.image('bg-sun', bgSunUrl);
    this.load.image('sign-yakou', signYakouUrl);
    this.load.image('sign-hotel', signHotelUrl);
    this.load.image('sign-music', signMusicUrl);
    this.load.image('sign-shinya', signShinyaUrl);
  }

  create() {
    this.startRun();

    // 배경 레이어 (하늘·노을 선·패럴랙스 스카이라인·바닥 그리드).
    // 가장 먼저 add → 디스플레이 리스트 최하단 = 모든 게임 오브젝트 뒤에 렌더.
    this.createBackground();

    // 고스트 달리기 애니메이션(2프레임 교차) — 렌더 전용, 씬당 1회 등록
    if (!this.anims.exists('ghost-run')) {
      this.anims.create({
        key: 'ghost-run',
        frames: [{ key: 'ghost-run-0' }, { key: 'ghost-run-1' }],
        frameRate: GHOST_RUN_FPS,
        repeat: -1,
      });
    }

    // 고스트 풀: 발로 뛰는 헤일로 고스트(죽은 라이벌). 보라 틴트 + 반투명.
    for (let i = 0; i < GHOST_TOP_N; i++) {
      const g = this.add
        .sprite(toScreenX(C.PLAYER_X), GROUND_Y_PX, 'ghost-run-0')
        .setOrigin(0.5, 1)
        .setTint(COLOR_GHOST)
        .setAlpha(GHOST_SPRITE_ALPHA)
        .setVisible(false);
      g.setDisplaySize((g.width / g.height) * GHOST_ART_H, GHOST_ART_H);
      g.play({ key: 'ghost-run', startFrame: i % 2 }); // 위상 분산 → 군집이 덜 똑같이 보임
      this.ghostRects.push(g);
    }

    // 플레이어: 후드 라이더 + 네온 오토바이. 아트는 히트박스보다 넓다(overhang).
    this.playerRect = this.add
      .image(toScreenX(C.PLAYER_X), GROUND_Y_PX, 'player-ride')
      .setOrigin(PLAYER_ART_ORIGIN_X, PLAYER_ART_ORIGIN_Y);
    this.playerRect.setDisplaySize(
      (this.playerRect.width / this.playerRect.height) * PLAYER_ART_H,
      PLAYER_ART_H,
    );

    // 장애물 풀(네온 건물) — sim 풀 인덱스와 1:1. 높이는 syncVisuals에서 setDisplaySize.
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      // 아키타입 2종 교차(cap=옥상/안테나형, floor=창문형)로 다양성 부여
      const tex = i % 2 === 0 ? 'building-cap' : 'building-floor';
      const r = this.add
        .image(0, GROUND_Y_PX, tex)
        .setOrigin(0.5, 1) // 바닥 접지 기준
        .setVisible(false);
      this.obstacleRects.push(r);
    }
    // 연료통 풀
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const c = this.add.image(0, 0, 'fuel-can').setVisible(false);
      c.setDisplaySize(FUEL_ART_SIZE, FUEL_ART_SIZE);
      this.fuelSprites.push(c);
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
      .text(DESIGN_W / 2, DESIGN_H * 0.78, '탭하여 건너뛰기', {
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 6)
      .setAlpha(0.85)
      .setVisible(false);

    // 구경 모드 상단 "당신은 죽었습니다" — 내가 죽은 뒤 구경 중에만 표시
    this.youDiedText = this.add
      .text(DESIGN_W / 2, 14, '당신은 죽었습니다', {
        fontSize: '22px',
        color: '#ff4757',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setStroke('#1a1a2e', 6)
      .setAlpha(0.92)
      .setVisible(false)
      .setDepth(20);

    // HUD: 체력바(상단 중앙) + 거리(우상단) + 콤보(좌상단)
    const barW = 220, barH = 14;
    this.add.rectangle(DESIGN_W / 2, 28, barW + 4, barH + 4, 0x000000, 0.5);
    this.hpFill = this.add
      .rectangle(DESIGN_W / 2 - barW / 2, 28, barW, barH, 0x2ecc71)
      .setOrigin(0, 0.5);
    // "HP" 라벨 — 체력바가 무엇인지 첫 눈에 알 수 있도록
    this.add
      .text(DESIGN_W / 2 - barW / 2 - 6, 28, 'HP', { fontSize: '12px', color: '#aaaaaa' })
      .setOrigin(1, 0.5);
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
      .text(0, -70, 'YOU LOSE', { fontSize: '30px', color: '#ff4757', fontStyle: 'bold' })
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

    // 시작 오버레이 — 판마다 항상 표시. 이력 있으면 최고 등수, 없으면 조작 안내.
    // tick()이 visible 동안 게임을 멈춰두고, 탭으로 닫혀 게임이 시작된다.
    {
      const ovBg = this.add
        .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x000000, 0.72);
      // 최고 등수 (이력 있으면 채워짐, 없으면 빈 문자열)
      this.startBestRankText = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 80, '', {
          fontSize: '28px',
          color: '#ffd700',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5)
        .setStroke('#1a1a2e', 6);
      // 조작 힌트(첫판) or 고스트 경쟁 안내(재방문)
      this.startSubText = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 10, '', {
          fontSize: '18px',
          color: '#b39ddb',
          align: 'center',
        })
        .setOrigin(0.5)
        .setStroke('#1a1a2e', 4);
      const ovCta = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 + 76, '탭하여 시작 →', {
          fontSize: '16px',
          color: '#5efce8',
        })
        .setOrigin(0.5);
      this.startOverlay = this.add
        .container(0, 0, [ovBg, this.startBestRankText, this.startSubText, ovCta])
        .setDepth(100);
      // 첫 표시 내용 채우기
      this.refreshStartOverlay();
    }

    // 피버 튜토리얼 — localStorage 'ga:fever-tutorial' 없으면 최초 1회 표시.
    // 첫 EV_FEVER_START 발동 시 게임을 일시정지하고 이 패널을 보여준다.
    try {
      this.needsFeverTutorial = !window.localStorage.getItem('ga:fever-tutorial');
    } catch { this.needsFeverTutorial = false; }
    if (this.needsFeverTutorial) {
      const feverSec = Math.round(C.FEVER_INTERVAL_SEC); // 하드코딩 방지
      const ftBg = this.add.rectangle(DESIGN_W / 2, DESIGN_H / 2, 420, 180, 0x1a1a2e, 0.95);
      const ftTitle = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 50, 'FEVER!', {
          fontSize: '24px',
          color: '#ffd700',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setStroke('#1a1a2e', 5);
      const ftDesc = this.add
        .text(
          DESIGN_W / 2,
          DESIGN_H / 2 - 8,
          `콤보를 ${feverSec}초 이상 유지하면 발동!\n무한 점프 + 탭마다 체력 회복`,
          { fontSize: '17px', color: '#ffffff', align: 'center' },
        )
        .setOrigin(0.5)
        .setStroke('#1a1a2e', 3);
      const ftSub = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 + 62, '탭하여 계속 →', {
          fontSize: '14px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      this.feverTutorial = this.add
        .container(0, 0, [ftBg, ftTitle, ftDesc, ftSub])
        .setDepth(90)
        .setVisible(false);
    }

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

    // 재시도 판에서는 피버 튜토리얼을 건너뜀 (이미 게임 흐름을 아는 상태)
    if (isRetry) this.needsFeverTutorial = false;

    this.gamePaused = false;
    if (this.gameOverPanel) this.gameOverPanel.setVisible(false);
    if (this.comboDisplay) this.comboDisplay.setVisible(false);
    if (this.feverOverlay) this.feverOverlay.setVisible(false);
    if (this.infiniteJumpText) this.infiniteJumpText.setVisible(false);
    if (this.spectateHintText) this.spectateHintText.setVisible(false);
    if (this.youDiedText) this.youDiedText.setVisible(false);
    if (this.pauseOverlay) this.pauseOverlay.setVisible(false);
    setPauseButtonState(false, true);
    // 재시작 시 오버레이를 다시 올리고 내용 갱신 (create()에서 첫 판 시 이미 visible)
    if (this.startOverlay) {
      this.refreshStartOverlay();
      this.startOverlay.setVisible(true);
    }
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
    // 시작 오버레이 표시 중: 닫기 + 이후 점프로 이어짐 (return 없음)
    if (this.startOverlay.visible) {
      this.startOverlay.setVisible(false);
      try { window.localStorage.setItem('ga:onboarded', '1'); } catch { /* 무시 */ }
    }
    // 일시정지 중 탭 = 재개.
    // 피버 튜토리얼로 멈춰있으면 먼저 닫고 togglePause로 이어진다.
    if (this.gamePaused) {
      if (this.feverTutorial?.visible) {
        this.feverTutorial.setVisible(false);
        try { window.localStorage.setItem('ga:fever-tutorial', '1'); } catch { /* 무시 */ }
      }
      this.togglePause();
      return;
    }
    if (this.spectating) {
      // 구경 중 탭 = 구경 즉시 종료 → 결과 패널 표시 (재시작 아님)
      this.spectating = false;
      this.spectateFramesLeft = 0;
      this.spectateHintText.setVisible(false);
      this.youDiedText.setVisible(false);
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
    // 시작 오버레이 표시 중: 시뮬·렌더 대기 (탭하면 닫히고 게임 시작)
    if (this.startOverlay.visible) return;
    if (!this.gamePaused) {
      // 렌더 fps가 어떻든 시뮬은 DT 단위로만 전진 (결정론 경계)
      this.timestep.update(delta, () => {
        this.sim.step();
        // 유령들은 라이브와 lockstep. 내가 죽은 뒤에는 '구경 모드'에서만 계속 달리고,
        // 결과 패널이 뜨면 함께 멈춘다.
        if (!this.sim.state.gameOver || this.spectating) {
          const ghostSteps = this.spectating ? SPECTATE_SPEED_MULT : 1;
          for (const g of this.ghosts) {
            const wasFinished = g.finished;
            for (let _s = 0; _s < ghostSteps; _s++) g.step();
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
            this.youDiedText.setVisible(false);
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
      if (!this.hasShownPotionHint) {
        this.hasShownPotionHint = true;
        this.bigPopup('+HP 회복!', '#4dabf7');
      } else {
        this.popup('+HP', '#4dabf7');
      }
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
      // 첫 피버 발동: 게임 일시정지 + 피버 튜토리얼 표시 (최초 1회)
      if (this.needsFeverTutorial && this.feverTutorial) {
        this.needsFeverTutorial = false;
        this.gamePaused = true;
        this.timestep.reset();
        this.feverTutorial.setVisible(true);
        setPauseButtonState(false, false); // 튜토리얼 중 일시정지 버튼 숨김
      }
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
        this.youDiedText.setVisible(true);
      } else {
        this.showResultPanel(cmp, myDist);
      }
    }
  }

  /**
   * 시작 오버레이 내용 갱신.
   * - 최고 등수(ga:best-rank)가 있으면 골드로 표시 + 고스트 경쟁 문구
   * - 없으면(첫 판) 조작 안내
   */
  private refreshStartOverlay() {
    let bestRank: number | null = null;
    let isFirstPlay = true;
    try {
      const raw = window.localStorage.getItem('ga:best-rank');
      if (raw !== null) bestRank = parseInt(raw, 10);
      isFirstPlay = !window.localStorage.getItem('ga:onboarded');
    } catch { /* localStorage 차단 환경 */ }

    if (bestRank !== null) {
      this.startBestRankText.setText(`최고 기록  ${bestRank}등`);
      this.startSubText.setText('고스트와 경쟁하세요!\n반투명 캐릭터를 추월해 순위를 올리세요');
    } else if (isFirstPlay) {
      this.startBestRankText.setText('');
      this.startSubText.setText('탭하여 점프, 장애물을 피하세요\n반투명 캐릭터는 다른 플레이어의 고스트');
    } else {
      this.startBestRankText.setText('');
      this.startSubText.setText('고스트와 경쟁하세요!\n더 멀리 가서 순위를 올리세요');
    }
  }

  /** 보류됐던 결과 패널 채우기 + 표시 (사망 즉시 or 구경 종료 후) */
  private showResultPanel(cmp: GhostComparison, myDist: number) {
    this.gameOverDistText.setText(`거리  ${Math.floor(myDist)}M`);

    // 최고 등수 저장 (고스트 있을 때만 의미있는 등수)
    if (cmp.hasGhosts) {
      const finalRankForSave = cmp.total - cmp.overtaken + 1;
      try {
        const stored = parseInt(window.localStorage.getItem('ga:best-rank') ?? '99999', 10);
        if (finalRankForSave < stored) {
          window.localStorage.setItem('ga:best-rank', String(finalRankForSave));
        }
      } catch { /* 무시 */ }
    }

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

  /**
   * 일본어 네온 간판 데코 생성 — 먼 배경(L2)에 흩뿌려 시티팝 분위기.
   * 각 간판을 x, x+DESIGN_W 두 벌로 두어 1040px 주기로 심리스 반복(스카이라인과 동일 트릭).
   */
  private makeSignageDecor(): Phaser.GameObjects.Image[] {
    // [텍스처키, x, 바닥y, 표시높이] — 원경이므로 작게·은은하게, 플레이 레인(하단) 위에만.
    const defs: [string, number, number, number][] = [
      ['sign-yakou', 120, 362, 92],
      ['sign-hotel', 470, 350, 86],
      ['sign-shinya', 720, 374, 66],
      ['sign-music', 905, 356, 96],
    ];
    const out: Phaser.GameObjects.Image[] = [];
    for (const [key, x, by, h] of defs) {
      for (const dx of [0, DESIGN_W]) {
        const img = this.add.image(x + dx, by, key).setOrigin(0.5, 1);
        img.setDisplaySize((img.width / img.height) * h, h).setAlpha(0.5);
        out.push(img);
      }
    }
    return out;
  }

  /** 배경 레이어 1회 생성 (하늘·노을 선·먼 스카이라인·바닥 그리드). 전부 렌더 전용. */
  private createBackground() {
    // 1) 하늘 그라데이션 (상단 인디고 → 지평선 마젠타). 지평선 위만 덮는다.
    const sky = this.add.graphics();
    sky.fillGradientStyle(COLOR_SKY_TOP, COLOR_SKY_TOP, COLOR_SKY_LOW, COLOR_SKY_LOW, 1);
    sky.fillRect(0, 0, DESIGN_W, GROUND_Y_PX);

    // 2) 레트로 선(노을 태양) 이미지 — 지평선 부근, 거의 고정(L1).
    const sun = this.add.image(DESIGN_W * 0.5, 214, 'bg-sun');
    sun.setDisplaySize((sun.width / sun.height) * 220, 220).setAlpha(0.95);

    // 3) 먼 도시 실루엣(코드) + 일본어 네온 간판 데코를 한 컨테이너에 → 함께 패럴랙스.
    const g1 = this.add.graphics();
    const g2 = this.add.graphics();
    this.drawSkyline(g1);
    this.drawSkyline(g2);
    g2.x = DESIGN_W;
    this.bgSkylineFar = this.add.container(0, 0, [g1, g2, ...this.makeSignageDecor()]);

    // 4) 바닥 네온 그리드 — 매 프레임 worldPx로 다시 그려 좌측 스크롤(syncVisuals).
    this.groundGrid = this.add.graphics();
    this.drawGroundGrid(0);
  }

  /** 먼 도시 실루엣 한 벌. 고정 시드 LCG라 두 벌이 동일 → 1040px 주기로 심리스. */
  private drawSkyline(g: Phaser.GameObjects.Graphics) {
    const W = DESIGN_W;
    const horizon = GROUND_Y_PX;
    let x = 0;
    let seed = 0x1a2b3c;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    while (x < W) {
      const bw = 26 + Math.floor(rnd() * 46); // 26~72
      if (x + bw > W) break; // 경계를 걸치지 않게 = 이음매 깔끔
      const bh = 30 + Math.floor(rnd() * 100); // 30~130
      g.fillStyle(COLOR_SKYLINE, 1);
      g.fillRect(x, horizon - bh, bw, bh);
      if (rnd() > 0.5) {
        g.fillStyle(COLOR_SKYLINE_WIN, 0.5);
        const wx = x + Math.floor(bw * 0.45);
        g.fillRect(wx, horizon - bh + 8, 2, 2);
        if (bh > 72) g.fillRect(wx, horizon - bh + 22, 2, 2);
      }
      x += bw + 6 + Math.floor(rnd() * 22); // 건물 간 간격
    }
  }

  /** 바닥 네온 그리드. worldPx만큼 좌측으로 흐르는 원근 그리드 (매 프레임 redraw). */
  private drawGroundGrid(worldPx: number) {
    const g = this.groundGrid;
    g.clear();
    const horizon = GROUND_Y_PX;
    const bottom = DESIGN_H;
    const cx = DESIGN_W * 0.5;
    g.fillStyle(COLOR_GROUND_DARK, 1);
    g.fillRect(0, horizon, DESIGN_W, bottom - horizon);
    // 지평선 글로우 라인
    g.lineStyle(2, COLOR_NEON_CYAN, 0.85);
    g.lineBetween(0, horizon, DESIGN_W, horizon);
    // 좌측으로 흐르는 수직 그리드(바닥에서 바깥으로 퍼지는 원근감)
    g.lineStyle(1, COLOR_NEON_CYAN, 0.22);
    const off = worldPx % GRID_SPACING;
    for (let gx = -off; gx <= DESIGN_W + GRID_SPACING; gx += GRID_SPACING) {
      const bx = cx + (gx - cx) * 1.8;
      g.lineBetween(gx, horizon, bx, bottom);
    }
    // 수평 보조선 2줄
    g.lineStyle(1, COLOR_NEON_CYAN, 0.13);
    g.lineBetween(0, horizon + 16, DESIGN_W, horizon + 16);
    g.lineBetween(0, horizon + 32, DESIGN_W, horizon + 32);
  }

  /** sim.state → 화면 동기화. 읽기만 한다. */
  private syncVisuals() {
    const s = this.sim.state;

    // 월드(장애물/포션/거리)의 렌더 기준: 평소엔 내 sim, 구경 모드에선 살아있는
    // 유령 sim — 같은 시드라 어느 sim이든 코스·거리가 프레임 단위로 동일하다
    const aliveGhost = this.spectating ? this.ghosts.find((g) => !g.finished) : undefined;
    const world = aliveGhost !== undefined ? aliveGhost.sim.state : s;

    // 배경 패럴랙스 (렌더 전용): worldPx = 누적 진행 픽셀 = distance(m) × UNITS_PER_METER.
    // 장애물 스크롤과 같은 기준이라 깊이감이 일관되고, sim은 전혀 건드리지 않는다.
    const worldPx = world.distance * C.UNITS_PER_METER;
    this.bgSkylineFar.x = -((worldPx * SKYLINE_PARALLAX) % DESIGN_W);
    this.drawGroundGrid(worldPx);

    // 플레이어 (무적 중엔 시뮬 프레임 기반 깜빡임, 죽으면 그 자리에서 디밍).
    // 아트 origin이 하단이므로 y = 히트박스 바닥의 화면 y = toScreenY(player.y).
    const playerAlpha = s.gameOver
      ? DEAD_PLAYER_ALPHA
      : s.invincibleFrames > 0
        ? (s.frame % 8 < 4 ? 0.3 : 0.9)
        : 1;
    this.playerRect.setY(toScreenY(s.player.y)).setAlpha(playerAlpha);
    // 상태별 컷 전환: 사망 > 피격(무적) > 공중(점프) > 기본 주행
    const playerTex = s.gameOver
      ? 'player-dead'
      : s.invincibleFrames > 0
        ? 'player-hit'
        : s.player.y > 2
          ? 'player-jump'
          : 'player-ride';
    if (this.playerRect.texture.key !== playerTex) {
      this.playerRect.setTexture(playerTex);
      this.playerRect.setDisplaySize(
        (this.playerRect.width / this.playerRect.height) * PLAYER_ART_H, PLAYER_ART_H,
      );
    }

    // 고스트들: 위치 갱신. origin 하단이라 y = toScreenY(ghost.y).
    for (let i = 0; i < GHOST_TOP_N; i++) {
      const sprite = this.ghostRects[i]!;
      const g = this.ghosts[i];
      const visible = g !== undefined && !g.finished;
      sprite.setVisible(visible);
      if (g !== undefined) sprite.setY(toScreenY(g.sim.state.player.y));
    }

    // 장애물(건물)/연료통: active만 보이게, 위치·높이 갱신 (객체 생성/파괴 없음).
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = world.obstacles[i]!;
      const r = this.obstacleRects[i]!;
      r.setVisible(o.active);
      if (o.active) {
        r.setDisplaySize(BUILDING_ART_W, o.h); // 폭 고정, 높이만 가변
        r.setPosition(toScreenX(o.x), GROUND_Y_PX); // origin 하단 → 바닥 접지
      }
    }
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = world.potions[i]!;
      const c = this.fuelSprites[i]!;
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

  /** 첫 이벤트 한정 강조 팝업 — popup()보다 크고 오래 남음 */
  private bigPopup(msg: string, color: string) {
    const x = toScreenX(C.PLAYER_X);
    const y = boxCenterScreenY(this.sim.state.player.y, C.PLAYER_H) - 50;
    const t = this.add
      .text(x, y, msg, { fontSize: '30px', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#1a1a2e', 6);
    this.tweens.add({
      targets: t,
      y: y - 54,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.out',
      onComplete: () => t.destroy(),
    });
  }
}
