// Phaser 3 렌더 레이어 — sim 상태의 '읽기 전용' 소비자 (D1).
//
//   pointerdown ──► recordTap + queueTap ──► [GameSim] ◄── FixedTimestep이 DT 단위로 step()
//                                               │
//                          syncVisuals()가 매 렌더 프레임 state를 '읽어서' 그림
//
// 철칙: 이 파일은 sim.state를 절대 변경하지 않는다. 게임 로직이 여기로 새는 순간
// 입력 로그만으로 게임을 복원할 수 없게 되어 골든 리플레이(T4)가 깨진다.
import Phaser from "phaser";
import * as Sentry from "@sentry/browser";
import { GameSim } from "../sim/sim";
import { GhostDriver } from "../sim/ghost";
import { FixedTimestep } from "../sim/timestep";
import * as C from "../sim/constants";
import {
  createInputLog,
  recordTap,
  serializeLog,
  SIM_VERSION,
  type InputLog,
} from "../sim/inputLog";
import { dailySeed } from "../dailySeed";
import {
  saveRun,
  loadTopRuns,
  GHOST_TOP_N,
  type GhostRecord,
} from "../ghostStore";
import { loadTopRunsRemote, submitRunRemote } from "../remoteStore";
import { compareGhosts, type GhostComparison } from "./ghostCompare";
import {
  DESIGN_W,
  DESIGN_H,
  GROUND_Y_PX,
  toScreenX,
  toScreenY,
  boxCenterScreenY,
} from "./viewport";
import { registerPauseToggle, setPauseButtonState } from "../controls";
import { track } from "../analytics";

// 게임 에셋(전처리본 assets/game/*) — Vite가 해시 URL로 번들. scripts/prep-assets.py 산출물.
import playerRideUrl from "../../assets/game/player-ride.png";
import playerJumpUrl from "../../assets/game/player-jump.png";
import playerHitUrl from "../../assets/game/player-hit.png";
import playerDeadUrl from "../../assets/game/player-dead.png";
import ghostRunSheetUrl from "../../assets/game/ghost-run.png";
import ghostCollapseUrl from "../../assets/game/ghost-collapse.png";
import fuelCanUrl from "../../assets/game/fuel-can.png";
import obsCarUrl from "../../assets/game/obs-car.png";
import obsBarrelUrl from "../../assets/game/obs-barrel.png";
import obsDebrisUrl from "../../assets/game/obs-debris.png";
import flamePilar1Url from "../../assets/game/flame-pilar-1.png";
import flamePilar2Url from "../../assets/game/flame-pilar-2.png";
// bg-sun 이미지는 코드 태양(createCodeSun)으로 대체 — import 제거
// fx-meteor-*: 코드 드로우 메테오(drawCodeMeteor)로 대체 — import 제거
// 일본어 네온 간판 데코 (배경 패럴랙스 레이어)
import signYakouUrl from "../../assets/images/signage/signage-yakou.png";
import signHotelUrl from "../../assets/images/signage/signage-hotel.png";
import signMusicUrl from "../../assets/images/signage/signage-music-bar.png";
import signShinyaUrl from "../../assets/images/signage/signage-shinya.png";

const COLOR_GHOST = 0xb39ddb; // 고스트 — 보라 계열 반투명(스프라이트 틴트)

// 배경(코드 스킨) 팔레트 — docs/design/asset-guide.md §3 컬러 토큰. 전부 렌더 전용.
const COLOR_SKY_TOP = 0x170a2e; // 하늘 상단(딥 인디고)
const COLOR_SKY_LOW = 0x6b1248; // 지평선(마젠타-퍼플)
const COLOR_NEON_CYAN = 0x36f9f6; // 바닥 그리드 / 지평선 글로우
const COLOR_SKYLINE = 0x1b0c33; // 먼 도시 실루엣
const COLOR_SKYLINE_WIN = 0xff6fb0; // 실루엣 창문 점
const COLOR_GROUND_DARK = 0x0a0612; // 지면(지평선 아래)
const SKYLINE_PARALLAX = 0.2; // 먼 스카이라인 스크롤 배수(월드속도 대비)
const GRID_SPACING = 70; // 바닥 그리드 수직선 간격(px)
const DEAD_PLAYER_ALPHA = 0.25; // 사망 후 구경 모드에서 내 캐릭터 디밍
const SPECTATE_MAX_SEC = 3; // 사망 후 구경 최대 시간
const SPECTATE_SPEED_MULT = 3; // 구경 모드에서 고스트 재생 배속

// 스프라이트 표시 튜닝 — 아트는 풋프린트(히트박스)보다 크게 overhang 허용(스펙 §1).
// 충돌은 sim의 직사각형 풋프린트로만 판정되므로 아래 값은 '보이는 크기'일 뿐이다.
const PLAYER_ART_H = 78; // 라이더 표시 높이(px) — 히트박스 42 + 후드/스카프 overhang
const PLAYER_ART_ORIGIN_X = 0.62; // 아트 내 히트박스 정렬점(왼쪽 트레일 보정 → 우측 치우침)
const PLAYER_ART_ORIGIN_Y = 0.96; // 바퀴 접지점이 바닥선에 닿도록
const GHOST_ART_H = 106; // 고스트 러너 표시 높이 (94→106: 주인공 대비 존재감 살짝 더)
const GHOST_SPRITE_ALPHA = 0.5; // 디테일 실루엣이 읽히도록 도형(0.22)보다 높임
const FUEL_ART_SIZE = 100; // 연료통 표시 한 변(px) — 52→100: 지금보다 2배
const GHOST_RUN_FPS = 12; // 고스트 달리기 6프레임 사이클 속도(렌더 전용) — 12fps=0.5s/cycle
// 고스트 x 분산 오프셋 — 렌더 전용. 충돌·거리 판정과 무관.
// 한 덩어리로 겹치지 않게 주인공 주변으로 흩어뜨림(주로 뒤쪽에).
const GHOST_X_OFFSETS = [-72, -42, -20, 18, 40, 64, -54, 32, -10, 50] as const; // 너무 퍼지지 않도록 줄임

const MAX_METEORS = 6; // 동시 메테오 상한(스폰당 1~3개가 누적)

// 장애물 아트 텍스처 키(렌더 전용·결정론 무관). 건물은 더 이상 쓰지 않는다.
const OBS_LOW = ["obs-car", "obs-debris"] as const; // 낮고 넓음
const OBS_MID = ["obs-barrel"] as const; // 중간(드럼통)
const OBS_TALL = ["flame-pilar-1", "flame-pilar-2"] as const; // 높은 불기둥

// 장애물 아트 폭/높이 상수 (렌더 전용)
const OBSTACLE_ART_SCALE = 1.2; // 시각 크기 살짝 키움(히트박스는 sim의 o.h 유지)
const OBSTACLE_MIN_W = 40; // 히트박스(OBS_W=32)를 덮는 최소 폭
const OBSTACLE_MAX_W = 150; // 과도한 가로 오버행 방지 상한

/**
 * 높이(o.h)에 맞는 후보군에서 '직전 장애물과 다른' 타입을 골라 인접 중복을 막는다.
 * 렌더 전용 — 충돌·거리 판정과 무관(연출).
 */
function pickObstacleType(h: number, last: string): string {
  let pool: readonly string[];
  if (h > C.OBS_H_MAX)
    pool = OBS_TALL; // TALL 패턴 = 불기둥
  else if (h > 80) pool = [...OBS_MID, ...OBS_TALL];
  else pool = [...OBS_LOW, ...OBS_MID];
  const avoid = pool.filter((k) => k !== last);
  const cands = avoid.length > 0 ? avoid : pool;
  return cands[Math.floor(Math.random() * cands.length)]!;
}

// 장애물 타입별 연기 프로파일 — 종류마다 색/가닥수/높이/굵기/일렁임을 달리한다(렌더 전용).
type SmokeProfile = {
  color: number;
  strands: number;
  height: number;
  baseW: number;
  alpha: number;
  spread: number;
  sway: number;
  freq: number;
  ember: boolean; // 밑동을 불씨색으로 데울지(불 타입)
  glow: number; // 일렁이는 베이스 불빛 색 (역동성)
  fire: boolean; // 불꽃 깜빡임(밝은 코어 + 스프라이트 흔들림)을 줄지
};
function smokeProfile(key: string): SmokeProfile {
  switch (key) {
    case "obs-debris": // 잔해: 낮고 넓은 흙먼지
      return { color: 0x9b8f86, strands: 3, height: 30, baseW: 5.5, alpha: 0.3, spread: 11, sway: 16, freq: 1.5, ember: false, glow: 0xff5a7a, fire: false };
    case "obs-barrel": // 드럼통: 검고 높은 매연 + 불씨 밑동
      return { color: 0x655e6c, strands: 2, height: 56, baseW: 5, alpha: 0.42, spread: 6, sway: 12, freq: 2.2, ember: true, glow: 0xff7a3c, fire: true };
    case "flame-pilar-1":
    case "flame-pilar-2": // 불기둥: 화염 위 옅은 열기 연기 한 가닥
      return { color: 0x7a6a72, strands: 1, height: 40, baseW: 3.5, alpha: 0.22, spread: 0, sway: 11, freq: 2.6, ember: true, glow: 0xff9a3c, fire: true };
    case "obs-car": // 부서진 차: 엔진룸 회색 연기 + 시안 네온 잔광
    default:
      return { color: 0xb8b2c0, strands: 2, height: 42, baseW: 4.5, alpha: 0.32, spread: 8, sway: 13, freq: 2.0, ember: false, glow: 0x2de1ff, fire: false };
  }
}

// 코드 드로우 메테오 1개의 상태(렌더 전용, sim 무관)
type CodeMeteor = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  elapsed: number;
  duration: number;
  size: number;
  tailAngle: number;
};

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
  private prevRank = 0; // 이전 프레임 등수 — 상승 감지용
  private feverCount = 0; // 이번 판 피버 발동 횟수 — game_over 이벤트용
  private crashed = false; // 렌더 루프 예외 발생 시 1회만 보고하고 정지 (이벤트 폭주 방지)
  private gamePaused = false;
  // 인게임 안내
  private startOverlay!: Phaser.GameObjects.Container; // 판 시작마다 표시되는 오버레이
  private startBestRankText!: Phaser.GameObjects.Text; // 최고 등수 (이력 있으면 표시)
  private startSubText!: Phaser.GameObjects.Text; // 고스트 경쟁 안내 / 첫판 조작 힌트
  private feverTutorial: Phaser.GameObjects.Container | null = null; // 첫 피버 일시정지 안내
  private hasShownPotionHint = false; // 첫 포션 획득 강조 (세션 1회)
  private needsFeverTutorial = true; // 첫 피버 멈춤 튜토리얼 필요 여부
  private pauseOverlay!: Phaser.GameObjects.Container;
  private _windowTapHandler!: () => void;
  private feverOverlay!: Phaser.GameObjects.Rectangle; // 피버 중 warm tint 레이어
  private infiniteJumpText!: Phaser.GameObjects.Text; // 피버 중 "클릭시 무한 회복!" 안내
  private spectateHintText!: Phaser.GameObjects.Text; // 구경 중 "탭하여 건너뛰기" 안내
  private youDiedText!: Phaser.GameObjects.Text; // 구경 모드 상단 "당신은 죽었습니다"

  // 고스트 스프라이트 풀 — GHOST_TOP_N개를 create()에서 한 번만 생성 (D6).
  // 발로 뛰는 헤일로 고스트(죽은 라이벌) 스프라이트, 보라 틴트 + 반투명.
  private ghostRects: Phaser.GameObjects.Sprite[] = [];
  // 고스트 엎어짐 연출 상태 — 기록 종료(finished) 시 1회 텀블 후 done. 렌더 전용.
  private ghostTumbleState: ("run" | "tumbling" | "done")[] = [];
  private playerRect!: Phaser.GameObjects.Image; // 후드 라이더 + 네온 오토바이
  // sim의 고정 크기 풀과 1:1 매핑 — 생성은 create()에서 단 한 번 (D6)
  private obstacleRects: Phaser.GameObjects.Image[] = []; // 아포칼립스 장애물(가변 높이)
  private obstacleType: string[] = []; // 슬롯별 배정된 아트 타입 키
  private obstacleWasActive: boolean[] = []; // 활성 전이(스폰) 감지용
  private lastObstacleType = ""; // 직전 배정 타입 — 인접 중복 방지
  private fuelSprites: Phaser.GameObjects.Image[] = []; // 연료통(회복=주유)

  // 배경 패럴랙스 레이어 (렌더 전용 — sim 무관, world.distance만 읽어 스크롤)
  private bgSkylineFar!: Phaser.GameObjects.Container;
  private sunGraphics!: Phaser.GameObjects.Graphics; // 코드 태양 — 렌더 전용 (일렁 애니 포함)
  private groundGrid!: Phaser.GameObjects.Graphics;
  // 장애물 주변에서 피어오르는 연기 — 두꺼운 웨이브 선, 렌더 전용 코드 드로우. sim 무관.
  private smokeGfx!: Phaser.GameObjects.Graphics;
  // 메테오 낙하 연출 — 코드 드로우, 렌더 전용 (결정론 무관)
  // 동시 다수 메테오 — 스폰 이벤트마다 1~3개가 쏟아진다(최대 MAX_METEORS 동시).
  private codeMeteors: CodeMeteor[] = [];
  private meteorGfx!: Phaser.GameObjects.Graphics;
  private meteorSpawnMs = 0;
  // 레이저 경고 이펙트 — 렌더 전용 Graphics 레이어
  private laserGraphics!: Phaser.GameObjects.Graphics;
  private renderTimeMs = 0; // 렌더 전용 시계 (sim 무관, Math.sin 연출용)
  // 바이크 네온 글로우 FX (WebGL postFX — 비지원 기기에서는 null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private playerGlow: any = null;

  private hpFill!: Phaser.GameObjects.Rectangle;
  // #11 가로형 랭킹 패널 — 상단, 3위 고스트(최종거리 고정) + 플레이어(실시간)
  // panel[0]=플레이어, panel[1]=G1, panel[2]=G2, panel[3]=G3 (컨테이너)
  private rankPanels: Phaser.GameObjects.Container[] = [];
  private rankPanelBgs: Phaser.GameObjects.Rectangle[] = [];
  private rankPanelTexts: Phaser.GameObjects.Text[] = [];
  private top3GhostDists: number[] = []; // startRun()에서 캐시, 판 내내 고정
  private ghostsAreOwnRecords = false; // true = 로컬 저장 기록(내 것), 라벨에 YOU 사용
  private gameOverPanel!: Phaser.GameObjects.Container;
  private gameOverDistText!: Phaser.GameObjects.Text;
  private comparisonText!: Phaser.GameObjects.Text; // 신기록/뒤짐 비교 한 줄
  private overtakeText!: Phaser.GameObjects.Text; // "고스트 K/N 제침"
  private hintText!: Phaser.GameObjects.Text; // "탭하여 재시작" / "한 판 더?"

  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    // 전처리된 게임 텍스처 로드 (Vite 해시 URL). 결정론과 무관한 렌더 자원.
    this.load.image("player-ride", playerRideUrl);
    this.load.image("player-jump", playerJumpUrl);
    this.load.image("player-hit", playerHitUrl);
    this.load.image("player-dead", playerDeadUrl);
    // ghost-run: 6프레임 스프라이트시트(전처리본 1608×300 → 각 268×300). 배경 투명·정렬 완료.
    this.load.spritesheet("ghost-run", ghostRunSheetUrl, {
      frameWidth: 268,
      frameHeight: 300,
    });
    // ghost-collapse: 엎어짐 3프레임(전처리본 1260×320 → 각 420×320). run과 동일 배율(높이300 기준).
    this.load.spritesheet("ghost-collapse", ghostCollapseUrl, {
      frameWidth: 420,
      frameHeight: 320,
    });
    this.load.image("fuel-can", fuelCanUrl);
    // 아포칼립스 장애물 5종 (건물 제거). 차/잔해=낮고넓음, 드럼통=중간, 불기둥=높음.
    this.load.image("obs-car", obsCarUrl);
    this.load.image("obs-barrel", obsBarrelUrl);
    this.load.image("obs-debris", obsDebrisUrl);
    this.load.image("flame-pilar-1", flamePilar1Url);
    this.load.image("flame-pilar-2", flamePilar2Url);
    // bg-sun: 코드 태양으로 대체, 이미지 로드 불필요
    // fx-meteor-*: 코드 드로우(drawCodeMeteor)로 대체, 이미지 로드 불필요
    this.load.image("sign-yakou", signYakouUrl);
    this.load.image("sign-hotel", signHotelUrl);
    this.load.image("sign-music", signMusicUrl);
    this.load.image("sign-shinya", signShinyaUrl);
  }

  create() {
    this.startRun();

    // 배경 레이어 (하늘·노을 선·패럴랙스 스카이라인·바닥 그리드).
    // 가장 먼저 add → 디스플레이 리스트 최하단 = 모든 게임 오브젝트 뒤에 렌더.
    this.createBackground();

    // 메테오 풀은 createBackground() 안에서 태양보다 먼저 생성됨 (Z-order 보장).
    this.meteorSpawnMs = 0; // 게임 시작 즉시 첫 스폰

    // laserGraphics는 createBackground() 안에서 태양보다 먼저 생성됨 (Z-order 보장)

    // 고스트 달리기 애니메이션(6프레임 스프라이트시트) — 렌더 전용, 씬당 1회 등록
    if (!this.anims.exists("ghost-run")) {
      this.anims.create({
        key: "ghost-run",
        frames: this.anims.generateFrameNumbers("ghost-run", {
          start: 0,
          end: 5,
        }),
        frameRate: GHOST_RUN_FPS,
        repeat: -1,
      });
    }
    // 엎어짐 애니: 비틀→무릎→완전히 엎어짐 3프레임, 1회 재생(반복 없음).
    if (!this.anims.exists("ghost-collapse")) {
      this.anims.create({
        key: "ghost-collapse",
        frames: this.anims.generateFrameNumbers("ghost-collapse", {
          start: 0,
          end: 2,
        }),
        frameRate: 6,
        repeat: 0,
      });
    }

    // 고스트 풀: 발로 뛰는 헤일로 고스트(죽은 라이벌). 보라 틴트 + 반투명.
    for (let i = 0; i < GHOST_TOP_N; i++) {
      const g = this.add
        .sprite(toScreenX(C.PLAYER_X), GROUND_Y_PX, "ghost-run", 0)
        .setOrigin(0.5, 1)
        .setTint(COLOR_GHOST)
        .setAlpha(GHOST_SPRITE_ALPHA)
        .setVisible(false);
      g.setDisplaySize((g.width / g.height) * GHOST_ART_H, GHOST_ART_H);
      // 시작 프레임·재생속도를 고스트마다 랜덤화 → 군집이 똑같이 안 뛰고 제각각 보임.
      // 렌더 전용(Math.random 허용) — 충돌·거리 판정과 무관.
      g.play({ key: "ghost-run", startFrame: Phaser.Math.Between(0, 5) });
      g.anims.timeScale = 0.82 + Math.random() * 0.46; // 0.82~1.28배 속도 변주
      this.ghostRects.push(g);
      this.ghostTumbleState.push("run");
    }

    // 플레이어: 후드 라이더 + 네온 오토바이. 아트는 히트박스보다 넓다(overhang).
    this.playerRect = this.add
      .image(toScreenX(C.PLAYER_X), GROUND_Y_PX, "player-ride")
      .setOrigin(PLAYER_ART_ORIGIN_X, PLAYER_ART_ORIGIN_Y);
    this.playerRect.setDisplaySize(
      (this.playerRect.width / this.playerRect.height) * PLAYER_ART_H,
      PLAYER_ART_H,
    );
    // 바이크 시안 네온 글로우 — WebGL postFX, 비지원 기기는 무시 (렌더 전용, 결정론 무관)
    try {
      if (this.playerRect.postFX) {
        this.playerGlow = this.playerRect.postFX.addGlow(
          0x5efce8,
          3,
          0,
          false,
          0.1,
          12,
        );
      }
    } catch {
      /* postFX 비지원 환경 — 무시 */
    }

    // 장애물 연기 레이어 — 장애물 풀보다 먼저 add → 장애물 스프라이트 뒤에서 피어오름.
    this.smokeGfx = this.add.graphics();

    // 장애물 풀 — sim 풀 인덱스와 1:1. 텍스처(차/잔해/드럼통/불기둥)·크기는 syncVisuals에서 갱신.
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const r = this.add
        .image(0, GROUND_Y_PX, "obs-car")
        .setOrigin(0.5, 1) // 바닥 접지 기준
        .setVisible(false);
      this.obstacleRects.push(r);
      this.obstacleType.push("obs-car");
      this.obstacleWasActive.push(false);
    }
    // 연료통 풀
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const c = this.add.image(0, 0, "fuel-can").setVisible(false);
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
      .text(DESIGN_W / 2, 178, "클릭시 무한 회복!", {
        fontSize: "22px",
        color: "#ffd700",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setStroke("#1a1a2e", 5)
      .setAlpha(0.9)
      .setVisible(false)
      .setDepth(10);

    // 구경 모드 안내 — 내가 죽은 뒤 유령들이 계속 달리는 동안 탭으로 건너뛸 수 있음을 알림
    this.spectateHintText = this.add
      .text(DESIGN_W / 2, DESIGN_H * 0.78, "탭하여 건너뛰기", {
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setStroke("#1a1a2e", 6)
      .setAlpha(0.85)
      .setVisible(false);

    // 구경 모드 상단 "당신은 죽었습니다" — 내가 죽은 뒤 구경 중에만 표시
    this.youDiedText = this.add
      .text(DESIGN_W / 2, 14, "당신은 죽었습니다", {
        fontSize: "22px",
        color: "#ff4757",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0)
      .setStroke("#1a1a2e", 6)
      .setAlpha(0.92)
      .setVisible(false)
      .setDepth(20);

    // HUD: 체력바(하단 중앙) + 거리(우상단) + 랭킹 패널(좌상단)
    // ── HP바: 화면 하단 띠(GROUND_Y_PX~DESIGN_H) 중앙에 배치 ──
    const barW = 260,
      barH = 14;
    const barY = DESIGN_H - 24; // 지면 아래 바닥 띠 중앙
    this.add
      .rectangle(DESIGN_W / 2, barY, barW + 4, barH + 4, 0x000000, 0.65)
      .setDepth(20);
    this.hpFill = this.add
      .rectangle(DESIGN_W / 2 - barW / 2, barY, barW, barH, 0x2ecc71)
      .setOrigin(0, 0.5)
      .setDepth(21);
    this.add
      .text(DESIGN_W / 2 - barW / 2 - 8, barY, "HP", {
        fontSize: "12px",
        color: "#aaaaaa",
      })
      .setOrigin(1, 0.5)
      .setDepth(22);

    // ── paceText/overtakeHudText: 랭킹 패널로 대체 → 투명으로 유지 ──
    this.paceText = this.add
      .text(-9999, -9999, "", { fontSize: "14px", color: "#ffffff" })
      .setVisible(false);
    this.overtakeHudText = this.add
      .text(-9999, -9999, "", { fontSize: "15px", color: "#b39ddb" })
      .setVisible(false);

    // ── 랭킹 패널: 상단 가로형 4칸 (슬롯 0=1등 ~ 3=4등), 초기 x=-9999(오프스크린) ──
    // panel[0]=플레이어(시안), panel[1..3]=상위 3고스트(회색). 순위 변경 시 tween으로 좌우 이동.
    const RP_H = 36,
      RP_W = 240;
    const rpLabels = ["YOU", "G1", "G2", "G3"];
    const rpIsPlayer = [true, false, false, false];
    for (let i = 0; i < 4; i++) {
      const fillColor = rpIsPlayer[i] ? 0x0b2e38 : 0x111111;
      const bg = this.add
        .rectangle(0, 0, RP_W, RP_H, fillColor, rpIsPlayer[i] ? 0.88 : 0.65)
        .setOrigin(0, 0);
      if (rpIsPlayer[i]) bg.setStrokeStyle(1.5, 0x5efce8, 1.0);
      const txt = this.add
        .text(10, RP_H / 2, rpLabels[i]!, {
          fontSize: "13px",
          color: rpIsPlayer[i] ? "#5efce8" : "#666666",
          fontFamily: "monospace",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      const container = this.add
        .container(-9999, 4, [bg, txt])
        .setDepth(22)
        .setVisible(false);
      this.rankPanels.push(container);
      this.rankPanelBgs.push(bg);
      this.rankPanelTexts.push(txt);
    }
    // 화면 중앙 큰 콤보 숫자 — combo >= 2 일 때만 표시, 플레이 레인 위쪽에 배치
    this.comboDisplay = this.add
      .text(DESIGN_W / 2, 130, "", {
        fontSize: "50px",
        color: "#ffd166",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0.8)
      .setStroke("#1a1a2e", 6)
      .setVisible(false)
      .setDepth(10);

    // 게임오버 패널 (숨김 상태로 미리 생성)
    const goBg = this.add.rectangle(0, 0, 340, 200, 0x000000, 0.72);
    const goTitle = this.add
      .text(0, -70, "YOU LOSE", {
        fontSize: "30px",
        color: "#ff4757",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.gameOverDistText = this.add
      .text(0, -28, "", { fontSize: "22px", color: "#ffffff" })
      .setOrigin(0.5);
    this.comparisonText = this.add
      .text(0, 2, "", { fontSize: "17px", color: "#ffd166", fontStyle: "bold" })
      .setOrigin(0.5);
    this.overtakeText = this.add
      .text(0, 28, "", { fontSize: "15px", color: "#b39ddb" })
      .setOrigin(0.5);
    this.hintText = this.add
      .text(0, 64, "탭하여 재시작", { fontSize: "15px", color: "#aaaaaa" })
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
    const poBg = this.add.rectangle(
      DESIGN_W / 2,
      DESIGN_H / 2,
      DESIGN_W,
      DESIGN_H,
      0x000000,
      0.55,
    );
    const poText = this.add
      .text(DESIGN_W / 2, DESIGN_H / 2, "일시정지\n탭하여 계속", {
        fontSize: "28px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5)
      .setStroke("#1a1a2e", 6);
    this.pauseOverlay = this.add
      .container(0, 0, [poBg, poText])
      .setVisible(false);

    // 시작 오버레이 — 판마다 항상 표시. 이력 있으면 최고 등수, 없으면 조작 안내.
    // tick()이 visible 동안 게임을 멈춰두고, 탭으로 닫혀 게임이 시작된다.
    {
      const ovBg = this.add.rectangle(
        DESIGN_W / 2,
        DESIGN_H / 2,
        DESIGN_W,
        DESIGN_H,
        0x000000,
        0.72,
      );
      // 최고 등수 (이력 있으면 채워짐, 없으면 빈 문자열)
      this.startBestRankText = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 80, "", {
          fontSize: "28px",
          color: "#ffd700",
          fontStyle: "bold",
          align: "center",
        })
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 6);
      // 조작 힌트(첫판) or 고스트 경쟁 안내(재방문)
      this.startSubText = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 10, "", {
          fontSize: "18px",
          color: "#b39ddb",
          align: "center",
        })
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 4);
      const ovCta = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 + 76, "탭하여 시작 →", {
          fontSize: "16px",
          color: "#5efce8",
        })
        .setOrigin(0.5);
      this.startOverlay = this.add
        .container(0, 0, [
          ovBg,
          this.startBestRankText,
          this.startSubText,
          ovCta,
        ])
        .setDepth(100);
      // 첫 표시 내용 채우기
      this.refreshStartOverlay();
    }

    // 피버 튜토리얼 — localStorage 'ga:fever-tutorial' 없으면 최초 1회 표시.
    // 첫 EV_FEVER_START 발동 시 게임을 일시정지하고 이 패널을 보여준다.
    try {
      this.needsFeverTutorial =
        !window.localStorage.getItem("ga:fever-tutorial");
    } catch {
      this.needsFeverTutorial = false;
    }
    if (this.needsFeverTutorial) {
      const feverSec = Math.round(C.FEVER_INTERVAL_SEC); // 하드코딩 방지
      const ftBg = this.add.rectangle(
        DESIGN_W / 2,
        DESIGN_H / 2,
        420,
        180,
        0x1a1a2e,
        0.95,
      );
      const ftTitle = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 - 50, "FEVER!", {
          fontSize: "24px",
          color: "#ffd700",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 5);
      const ftDesc = this.add
        .text(
          DESIGN_W / 2,
          DESIGN_H / 2 - 8,
          `콤보를 ${feverSec}초 이상 유지하면 발동!\n무한 점프 + 탭마다 체력 회복`,
          { fontSize: "17px", color: "#ffffff", align: "center" },
        )
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 3);
      const ftSub = this.add
        .text(DESIGN_W / 2, DESIGN_H / 2 + 62, "탭하여 계속 →", {
          fontSize: "14px",
          color: "#aaaaaa",
        })
        .setOrigin(0.5);
      this.feverTutorial = this.add
        .container(0, 0, [ftBg, ftTitle, ftDesc, ftSub])
        .setDepth(90)
        .setVisible(false);
    }

    registerPauseToggle(() => {
      this.togglePause();
    });

    // 화면 어디를 탭해도 점프 — 캔버스 밖 빈 공간(좌우 기둥)도 포함
    // #fs-btn은 pointerdown에서 stopPropagation → 이 핸들러까지 버블되지 않음
    this._windowTapHandler = () => {
      this.onTap();
    };
    window.addEventListener("pointerdown", this._windowTapHandler, {
      passive: true,
    });
    this.events.once("shutdown", () => {
      window.removeEventListener("pointerdown", this._windowTapHandler);
    });

    // Space·ArrowUp도 같은 onTap 경로 — e.repeat는 꾹 누름 자동반복이라 한 번만 처리
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === " " || event.key === "ArrowUp") {
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
    // 상위 3 고스트 최종거리 캐시 — 랭킹 패널의 고정 타깃 값
    this.top3GhostDists = [...this.ghostDistances]
      .sort((a, b) => b - a)
      .slice(0, 3);
    // 원격 기록 없음 = 로컬 저장 = 내 기록 → 랭킹 패널에서 G# 대신 YOU 표시
    this.ghostsAreOwnRecords = this.remoteRuns.length === 0;
    this.overtakenLive = 0;
    this.spectating = false;
    this.pendingCmp = null;
    this.prevCombo = 0;
    this.prevRank = this.ghosts.length + 1;
    this.feverCount = 0;
    console.log(
      `[ghost-arcade] 시드 ${this.seed}, 유령 ${this.ghosts.length}기 로드 (원격 ${this.remoteRuns.length}기)`,
    );
    // is_retry로 첫 시작/재시작 구분 → 자발적 재시도율 = is_retry=true 비율.
    // 별도 retry 이벤트는 제거(game_start와 중복이었음).
    track("game_start", {
      seed: this.seed,
      ghost_count: this.ghosts.length,
      is_retry: isRetry,
    });

    // 다음 판을 위해 원격 데이터를 백그라운드로 갱신
    const currentSeed = this.seed;
    void loadTopRunsRemote(currentSeed).then((remote) => {
      this.remoteRuns = remote;
      // 새 기기 첫 판 UX: 고스트 없이 시작했고(ghosts.length===0) 원격 데이터가
      // 게임 시작 3초 이내(SIM_FPS*3 프레임)에 도착했으면 현재 판에도 즉시 적용.
      // Supabase 왕복이 보통 <1s이므로 대부분의 첫 판에서 고스트가 출현한다.
      if (
        remote.length > 0 &&
        this.ghosts.length === 0 &&
        this.sim.state.frame < C.SIM_FPS * 3
      ) {
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
    // 코드 메테오 리셋 (재시작 시 이전 메테오 제거)
    this.codeMeteors = [];
    this.meteorSpawnMs = 0;

    // 고스트 스프라이트 리셋 — 엎어짐 텀블 상태/변형 초기화 후 다시 달리기 재생.
    for (let i = 0; i < this.ghostRects.length; i++) {
      const sprite = this.ghostRects[i]!;
      this.tweens.killTweensOf(sprite);
      // 이전 판의 collapse 완료 콜백이 남아있지 않도록 제거(중단된 once 누적 방지).
      sprite.off(
        Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "ghost-collapse",
      );
      sprite.setAngle(0).setAlpha(GHOST_SPRITE_ALPHA);
      sprite.play({ key: "ghost-run", startFrame: Phaser.Math.Between(0, 5) });
      sprite.anims.timeScale = 0.82 + Math.random() * 0.46;
      this.ghostTumbleState[i] = "run";
    }
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
    const { recordAllBotRuns } = await import("../botRecorder");
    const botRuns = recordAllBotRuns(seed);
    for (const { log, distance } of botRuns) {
      await submitRunRemote(seed, log, distance, true);
    }
    try {
      window.localStorage.setItem(flagKey, "1");
    } catch {
      /* 무시 */
    }
  }

  private onTap() {
    // 시작 오버레이 표시 중: 닫기 + 이후 점프로 이어짐 (return 없음)
    if (this.startOverlay.visible) {
      this.startOverlay.setVisible(false);
      try {
        window.localStorage.setItem("ga:onboarded", "1");
      } catch {
        /* 무시 */
      }
    }
    // 일시정지 중 탭 = 재개.
    // 피버 튜토리얼로 멈춰있으면 먼저 닫고 togglePause로 이어진다.
    if (this.gamePaused) {
      if (this.feverTutorial?.visible) {
        this.feverTutorial.setVisible(false);
        try {
          window.localStorage.setItem("ga:fever-tutorial", "1");
        } catch {
          /* 무시 */
        }
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
      if (this.pendingCmp !== null)
        this.showResultPanel(this.pendingCmp, this.pendingMyDist);
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
      console.error("[ghost-arcade] 렌더 루프 크래시 — 정지", e);
    }
  }

  private tick(delta: number) {
    // 시작 오버레이 표시 중: 시뮬·렌더 대기 (탭하면 닫히고 게임 시작)
    if (this.startOverlay.visible) return;
    if (!this.gamePaused) {
      // 렌더 전용 시계 — 레이저·이펙트 연출에만 사용 (sim과 완전 분리)
      this.renderTimeMs += delta;
      // 코드 메테오 진행 (렌더 타이머 기반, sim 무관) — 수명 끝난 것 제거
      if (this.codeMeteors.length > 0) {
        for (const m of this.codeMeteors) m.elapsed += delta;
        this.codeMeteors = this.codeMeteors.filter(
          (m) => m.elapsed < m.duration,
        );
      }
      // 메테오 스포너 — 렌더 타이머(delta 기반), sim 무관. 게임 진행 중에만 스폰.
      if (!this.sim.state.gameOver && !this.spectating) {
        this.meteorSpawnMs -= delta;
        if (this.meteorSpawnMs <= 0) {
          this.spawnMeteor();
          this.meteorSpawnMs = 800 + Math.random() * 1200; // 0.8~2s
        }
      }
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
              this.popup("고스트 제침!", "#b39ddb");
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
              `[ghost-arcade] 구경 종료: ${allDead ? "유령 전멸" : "시간 만료"} (잔여 ${this.spectateFramesLeft}f)`,
            );
            this.spectating = false;
            this.spectateHintText.setVisible(false);
            this.youDiedText.setVisible(false);
            if (this.pendingCmp !== null)
              this.showResultPanel(this.pendingCmp, this.pendingMyDist);
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
      this.popup("BREAK", "#ff4757");
    }
    if (ev & C.EV_POTION) {
      if (!this.hasShownPotionHint) {
        this.hasShownPotionHint = true;
        this.bigPopup("+HP 회복!", "#4dabf7");
      } else {
        this.popup("+HP", "#4dabf7");
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
        .text(fx, fy, "FEVER!", {
          fontSize: "90px",
          color: "#ffd700",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 12);
      this.tweens.add({
        targets: ft,
        y: fy - 70,
        alpha: 0,
        scaleX: 1.6,
        scaleY: 1.6,
        duration: 950,
        ease: "Cubic.out",
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
      track("game_over", {
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
      console.log("[ghost-arcade] 입력 로그:", serializeLog(this.log));

      // 살아있는 유령이 있으면 구경 모드: 격차가 벌어지는 걸 보여준 뒤 결과 표시.
      // 유령이 없거나 전부 제쳤으면(신기록) 바로 결과.
      const alive = this.ghosts.filter((g) => !g.finished).length;
      console.log(
        `[ghost-arcade] 사망 frame=${this.sim.state.frame}, 생존 유령 ${alive}/${this.ghosts.length}`,
      );
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
    let isFirstPlay = true;
    try {
      isFirstPlay = !window.localStorage.getItem("ga:onboarded");
    } catch {
      /* localStorage 차단 환경 */
    }

    // 최고 등수 표기는 제거(요청). 첫 판만 조작 힌트, 이후엔 경쟁 안내.
    this.startBestRankText.setText("");
    if (isFirstPlay) {
      this.startSubText.setText(
        "탭하여 점프, 장애물을 피하세요\n고스트와 경쟁해서 추월해보세요!",
      );
    } else {
      this.startSubText.setText("고스트와 경쟁해서 추월해보세요!");
    }
  }

  /** 보류됐던 결과 패널 채우기 + 표시 (사망 즉시 or 구경 종료 후) */
  private showResultPanel(cmp: GhostComparison, myDist: number) {
    this.gameOverDistText.setText(`거리  ${Math.floor(myDist)}M`);

    // 최고 등수 저장 (고스트 있을 때만 의미있는 등수)
    if (cmp.hasGhosts) {
      const finalRankForSave = cmp.total - cmp.overtaken + 1;
      try {
        const stored = parseInt(
          window.localStorage.getItem("ga:best-rank") ?? "99999",
          10,
        );
        if (finalRankForSave < stored) {
          window.localStorage.setItem("ga:best-rank", String(finalRankForSave));
        }
      } catch {
        /* 무시 */
      }
    }

    if (!cmp.hasGhosts) {
      // 그날 첫 판 — 비교할 상대가 없다
      this.comparisonText.setText("");
      this.overtakeText.setText("");
      this.hintText.setText("탭하여 재시작");
    } else if (cmp.isRecord) {
      this.comparisonText
        .setText(`🏆 신기록! 이전 최고 +${cmp.diffM}M`)
        .setColor("#ffd166");
      const finalRank1 = cmp.total - cmp.overtaken + 1;
      this.overtakeText.setText(
        `최종 ${finalRank1}/${cmp.total + 1}등  ·  제침 ${cmp.overtaken}/${cmp.total}`,
      );
      this.hintText.setText("탭하여 재시작");
    } else {
      this.comparisonText
        .setText(`고스트에게 ${cmp.diffM}M 뒤짐`)
        .setColor(cmp.isClose ? "#ff8787" : "#aaaaaa");
      const finalRank2 = cmp.total - cmp.overtaken + 1;
      this.overtakeText.setText(
        `최종 ${finalRank2}/${cmp.total + 1}등  ·  제침 ${cmp.overtaken}/${cmp.total}`,
      );
      // 박빙이면 재시도를 직접 꼬신다
      this.hintText.setText(cmp.isClose ? "한 판 더?" : "탭하여 재시작");
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
      ["sign-yakou", 120, 362, 92],
      ["sign-hotel", 470, 350, 86],
      ["sign-shinya", 720, 374, 66],
      ["sign-music", 905, 356, 96],
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
    sky.fillGradientStyle(
      COLOR_SKY_TOP,
      COLOR_SKY_TOP,
      COLOR_SKY_LOW,
      COLOR_SKY_LOW,
      1,
    );
    sky.fillRect(0, 0, DESIGN_W, GROUND_Y_PX);

    // 1a) 레이저 이펙트 Graphics — 하늘 직후, 메테오·태양보다 먼저 add → 태양 뒤에 렌더.
    this.laserGraphics = this.add.graphics();

    // 1b) 코드 드로우 메테오 Graphics — 하늘 직후, 태양보다 먼저 add → 태양 뒤에 렌더.
    //     이미지 풀 방식을 벗어나 매 프레임 drawCodeMeteor()로 직접 그림.
    this.meteorGfx = this.add.graphics();

    // 2) 레트로웨이브 코드 태양 — syncVisuals에서 매 프레임 일렁이며 재드로우.
    // Graphics.setPosition(0, 214) 으로 기준점을 scene y=214에 두고, 드로우는 로컬 좌표(y=0이 센터).
    this.sunGraphics = this.add.graphics();
    this.sunGraphics.setPosition(0, 214).setAlpha(0.95);

    // 3) 먼 도시 실루엣(코드) + 일본어 네온 간판 데코를 한 컨테이너에 → 함께 패럴랙스.
    const g1 = this.add.graphics();
    const g2 = this.add.graphics();
    this.drawSkyline(g1);
    this.drawSkyline(g2);
    g2.x = DESIGN_W;
    this.bgSkylineFar = this.add.container(0, 0, [
      g1,
      g2,
      ...this.makeSignageDecor(),
    ]);

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

  /**
   * 장애물 주변에서 피어오르는 연기 — 코드 드로우, 렌더 전용(sim 무관).
   * 동그라미가 아니라 '두꺼운 웨이브 선'으로 표현: 장애물 꼭대기에서 위로 올라가며
   * 좌우로 흔들리는(sin 합성) 선을 세그먼트로 그려 아래는 굵고 위로 갈수록 가늘고 옅게.
   */
  private drawObstacleSmoke(world: {
    obstacles: { active: boolean; x: number; h: number }[];
  }): void {
    const g = this.smokeGfx;
    g.clear();
    const t = this.renderTimeMs * 0.001;

    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = world.obstacles[i]!;
      if (!o.active) continue;
      const p = smokeProfile(this.obstacleType[i] ?? "obs-car");
      const sx = toScreenX(o.x);
      const topY = GROUND_Y_PX - o.h * OBSTACLE_ART_SCALE; // 시각 꼭대기에서 발생

      // 일렁이는 베이스 불빛 — 밑동에 깔린 글로우가 맥동(역동성). 연기 뒤(=장애물 뒤) 레이어.
      const pulse = 0.55 + 0.45 * Math.sin(t * (p.fire ? 7 : 3) + i * 1.7);
      const baseR = o.h * 0.55;
      g.fillStyle(p.glow, 0.1 * pulse);
      g.fillCircle(sx, GROUND_Y_PX - 6, baseR * (0.85 + 0.3 * pulse));
      g.fillStyle(p.glow, 0.16 * pulse);
      g.fillCircle(sx, GROUND_Y_PX - 6, baseR * 0.5 * (0.85 + 0.25 * pulse));

      // 불 타입: 화염 위에서 깜빡이는 밝은 코어(불씨가 일렁이는 느낌)
      if (p.fire) {
        const flick = 0.5 + 0.5 * Math.sin(t * 13 + i * 3.1);
        const coreY = topY + o.h * 0.18;
        g.fillStyle(0xffd27a, 0.18 + 0.22 * flick);
        g.fillCircle(sx, coreY, baseR * 0.32 * (0.7 + 0.5 * flick));
      }

      for (let s = 0; s < p.strands; s++) {
        const phase = i * 1.3 + s * 2.4;
        const baseX = sx + (s - (p.strands - 1) / 2) * p.spread;
        const segs = 8;
        let px0 = baseX;
        let py0 = topY;
        for (let k = 1; k <= segs; k++) {
          const f = k / segs; // 0(밑동)→1(꼭대기)
          const yy = topY - f * p.height;
          // 여러 주파수 합성 → 위로 갈수록 크게 일렁이는 웨이브
          const wob =
            Math.sin(t * p.freq + f * 5 + phase) * (p.sway * (0.3 + f)) +
            Math.sin(t * 3.3 + phase * 1.7) * 2 * f;
          const xx = baseX + wob;
          const w = Math.max(1, p.baseW - f * (p.baseW - 1.3)); // 아래 굵고 위로 가늘게
          const a = (1 - f) * p.alpha; // 위로 갈수록 옅게
          // 불 타입은 밑동을 따뜻하게(불씨→연기 전이)
          const col =
            p.ember && f < 0.34 ? this.lerpColor(0xff7a3c, p.color, f / 0.34) : p.color;
          g.lineStyle(w, col, a);
          g.lineBetween(px0, py0, xx, yy);
          px0 = xx;
          py0 = yy;
        }
      }
    }
  }

  /** sim.state → 화면 동기화. 읽기만 한다. */
  private syncVisuals() {
    const s = this.sim.state;

    // 월드(장애물/포션/거리)의 렌더 기준: 평소엔 내 sim, 구경 모드에선 살아있는
    // 유령 sim — 같은 시드라 어느 sim이든 코스·거리가 프레임 단위로 동일하다
    const aliveGhost = this.spectating
      ? this.ghosts.find((g) => !g.finished)
      : undefined;
    const world = aliveGhost !== undefined ? aliveGhost.sim.state : s;

    // 배경 패럴랙스 (렌더 전용): worldPx = 누적 진행 픽셀 = distance(m) × UNITS_PER_METER.
    // 장애물 스크롤과 같은 기준이라 깊이감이 일관되고, sim은 전혀 건드리지 않는다.
    const worldPx = world.distance * C.UNITS_PER_METER;
    this.bgSkylineFar.x = -((worldPx * SKYLINE_PARALLAX) % DESIGN_W);

    // 점프 배경 연동: 플레이어가 올라가면 배경 레이어들이 살짝 내려가 카메라가 따라가는 느낌.
    // player.y는 sim 단위(지면=0, 위=양수, 최대≈376). 읽기 전용 → 결정론 무관.
    const jumpY = s.player.y * 0.07; // 최대 ≈26px. 과하면 멀미 — 작게 시작.
    this.bgSkylineFar.y = jumpY * 0.5; // 원경: 절반
    this.sunGraphics.y = 214 + jumpY * 0.3; // 태양: 약하게 점프 연동
    this.updateCodeSun();

    this.drawGroundGrid(worldPx);

    // 플레이어 (무적 중엔 시뮬 프레임 기반 깜빡임, 죽으면 그 자리에서 디밍).
    // 아트 origin이 하단이므로 y = 히트박스 바닥의 화면 y = toScreenY(player.y).
    const playerAlpha = s.gameOver
      ? DEAD_PLAYER_ALPHA
      : s.invincibleFrames > 0
        ? s.frame % 8 < 4
          ? 0.3
          : 0.9
        : 1;
    this.playerRect.setY(toScreenY(s.player.y)).setAlpha(playerAlpha);
    // 상태별 컷 전환: 사망 > 피격(무적) > 공중(점프) > 기본 주행
    const playerTex = s.gameOver
      ? "player-dead"
      : s.invincibleFrames > 0
        ? "player-hit"
        : s.player.y > 2
          ? "player-jump"
          : "player-ride";
    if (this.playerRect.texture.key !== playerTex) {
      this.playerRect.setTexture(playerTex);
      this.playerRect.setDisplaySize(
        (this.playerRect.width / this.playerRect.height) * PLAYER_ART_H,
        PLAYER_ART_H,
      );
    }

    // 고스트들: 위치 갱신. 피버 중엔 숨김(화면이 정신없어 가독성↓).
    // x는 GHOST_X_OFFSETS로 흩뿌려 군집 해소 — 렌더 전용 오프셋, 충돌·거리 판정과 무관.
    const showGhosts = s.feverFramesLeft === 0; // 피버 중 고스트 숨김
    for (let i = 0; i < GHOST_TOP_N; i++) {
      const sprite = this.ghostRects[i]!;
      const g = this.ghosts[i];
      const state = this.ghostTumbleState[i] ?? "run";
      if (g === undefined) {
        sprite.setVisible(false);
        continue;
      }

      const xOff = GHOST_X_OFFSETS[i % GHOST_X_OFFSETS.length] ?? 0;
      if (!g.finished) {
        // 살아있는 기록: 평소 주행. 위치 갱신 + 피버 중 숨김.
        sprite.setVisible(showGhosts);
        sprite.setX(toScreenX(C.PLAYER_X) + xOff);
        sprite.setY(toScreenY(g.sim.state.player.y));
      } else if (state === "run") {
        // 기록이 막 끝남 → 엎어짐 collapse 애니 1회 재생(전용 3프레임 에셋).
        this.ghostTumbleState[i] = "tumbling";
        sprite.setVisible(true);
        // 지면 고정: collapse 프레임은 하단 정렬이라 발/몸이 GROUND_Y_PX에 닿음.
        sprite.setX(toScreenX(C.PLAYER_X) + xOff).setY(GROUND_Y_PX);
        this.tweens.killTweensOf(sprite);
        sprite.setAngle(0);
        // play()가 텍스처를 collapse로 전환 — 스케일은 run과 동일(높이300 기준) 유지.
        sprite.play("ghost-collapse");
        sprite.once(
          Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "ghost-collapse",
          () => {
            // 엎어진 채 충분히 머물다 천천히 사라짐 — "쓰러짐"이 확실히 읽히도록.
            this.tweens.add({
              targets: sprite,
              alpha: 0,
              delay: 1400,
              duration: 900,
              ease: "Quad.in",
              onComplete: () => {
                this.ghostTumbleState[i] = "done";
                sprite.setVisible(false);
              },
            });
          },
        );
      }
      // state === 'tumbling': collapse 애니/페이드가 제어 — 건드리지 않음.
      // state === 'done': 숨김 유지(위 onComplete).
    }

    // 장애물/연료통: active만 보이게, 위치·텍스처·크기 갱신 (객체 생성/파괴 없음).
    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = world.obstacles[i]!;
      const r = this.obstacleRects[i]!;
      r.setVisible(o.active);
      if (!o.active) {
        this.obstacleWasActive[i] = false;
        continue;
      }
      // 스폰 순간(비활성→활성)에만 타입 배정 — 직전 타입과 다르게(인접 중복 방지).
      if (!this.obstacleWasActive[i]) {
        const t = pickObstacleType(o.h, this.lastObstacleType);
        this.obstacleType[i] = t;
        this.lastObstacleType = t;
        this.obstacleWasActive[i] = true;
      }
      const key = this.obstacleType[i]!;
      if (r.texture.key !== key) r.setTexture(key);
      // 높이는 히트박스(o.h)에 OBSTACLE_ART_SCALE을 곱해 살짝 크게(하단 접지).
      // 폭은 종횡비 유지하되 [최소,최대]로 클램프 → 너무 얇은 불기둥/너무 넓은 차 보정.
      const artH = o.h * OBSTACLE_ART_SCALE;
      const aspect = r.width / r.height;
      const w = Math.max(OBSTACLE_MIN_W, Math.min(artH * aspect, OBSTACLE_MAX_W));
      // 불 타입은 가로로 미세하게 일렁이게(불꽃이 흔들리는 느낌). 충돌은 sim의 o.h라 무관.
      const prof = smokeProfile(key);
      const flame = prof.fire ? 1 + 0.05 * Math.sin(this.renderTimeMs * 0.012 + i * 2.1) : 1;
      r.setDisplaySize(w * flame, artH);
      r.setPosition(toScreenX(o.x), GROUND_Y_PX); // origin 하단 → 바닥 접지
    }
    this.drawObstacleSmoke(world);
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = world.potions[i]!;
      const c = this.fuelSprites[i]!;
      c.setVisible(p.active);
      if (p.active) c.setPosition(toScreenX(p.x), toScreenY(p.y));
    }

    // HUD
    const ratio = s.hp / C.HP_MAX;
    this.hpFill.scaleX = ratio;
    this.hpFill.setFillStyle(
      ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf1c40f : 0xff4757,
    );
    // 거리 HUD는 랭킹 패널(updateRankPanel)로 이전 — 별도 distText 없음

    // 중앙 큰 콤보 — 2 이상일 때, 게임오버/구경 중엔 숨김.
    const showCombo = s.combo >= 2 && !s.gameOver;
    this.comboDisplay.setVisible(showCombo);
    if (showCombo) {
      this.comboDisplay.setText(`${s.combo} combo`);
      // 피버 대기 중: 연한 금색. 피버 활성 중: 밝은 황금 (오버레이와 통일)
      this.comboDisplay.setColor(s.feverFramesLeft > 0 ? "#ffd700" : "#ffd166");
      // 피버 타이머 진행도로 스케일 — 피버 중: 최대, 평시: 타이머 비율(0→1) × 최대
      const timerRatio =
        s.feverFramesLeft > 0
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
          ease: "Back.out",
        });
      } else if (!this.tweens.isTweening(this.comboDisplay)) {
        this.comboDisplay.setScale(targetScale);
      }
    }
    this.prevCombo = s.combo;

    // 바이크 네온 글로우 — 평시 시안, 피버 중 골드로 전환 (렌더 전용)
    if (this.playerGlow) {
      if (s.feverFramesLeft > 0) {
        this.playerGlow.color = 0xffd700;
        this.playerGlow.outerStrength = 7;
      } else if (s.gameOver) {
        this.playerGlow.outerStrength = 0;
      } else {
        this.playerGlow.color = 0x5efce8;
        this.playerGlow.outerStrength = s.invincibleFrames > 0 ? 6 : 3;
      }
    }

    // 레이저 경고 이펙트 드로우 (렌더 전용 — Math.sin 허용 구역)
    this.drawLasers();
    // 코드 드로우 메테오 (태양 뒤 Graphics 레이어 — displayList 순서로 Z 보장)
    this.drawCodeMeteor();

    // 피버 중 무한 점프 안내 — 게임 진행 중 피버 활성 시에만 표시
    this.infiniteJumpText.setVisible(s.feverFramesLeft > 0 && !s.gameOver);

    // 등수 HUD: paceText·overtakeHudText는 랭킹 패널로 대체 — 항상 숨김
    const hasGhosts = this.ghosts.length > 0;
    const aliveGhosts = this.ghosts.length - this.overtakenLive;
    const currentRank = aliveGhosts + 1;
    const totalRunners = this.ghosts.length + 1;
    this.paceText.setVisible(false);
    this.overtakeHudText.setVisible(false);
    // 랭킹 패널 업데이트 (렌더 전용 — sim 읽기만)
    this.updateRankPanel();
    if (hasGhosts) {
      const is1st = currentRank === 1;
      this.paceText.setColor(is1st ? "#ffd700" : "#ffffff");
      this.paceText.setText(`${currentRank} / ${totalRunners}등`);
      this.paceText.setY(toScreenY(s.player.y + C.PLAYER_H) - 6);
      if (!s.gameOver) {
        this.overtakeHudText.setText(
          `제침 ${this.overtakenLive}/${this.ghosts.length}`,
        );
        if (currentRank < this.prevRank) {
          this.tweens.killTweensOf(this.paceText);
          this.paceText.setScale(1.4);
          this.tweens.add({
            targets: this.paceText,
            scaleX: 1,
            scaleY: 1,
            duration: 250,
            ease: "Back.out",
          });
        }
      }
    }
    this.prevRank = currentRank;
  }

  /** 위로 떠오르며 사라지는 팝업 — 이벤트 발생 시에만 생성 (프레임당 아님) */
  private popup(msg: string, color: string) {
    const x = toScreenX(C.PLAYER_X);
    const y = boxCenterScreenY(this.sim.state.player.y, C.PLAYER_H) - 44;
    const t = this.add
      .text(x, y, msg, { fontSize: "20px", color, fontStyle: "bold" })
      .setOrigin(0.5);
    this.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      duration: 520,
      ease: "Cubic.out",
      onComplete: () => t.destroy(),
    });
  }

  /** 첫 이벤트 한정 강조 팝업 — popup()보다 크고 오래 남음 */
  private bigPopup(msg: string, color: string) {
    const x = toScreenX(C.PLAYER_X);
    const y = boxCenterScreenY(this.sim.state.player.y, C.PLAYER_H) - 50;
    const t = this.add
      .text(x, y, msg, { fontSize: "30px", color, fontStyle: "bold" })
      .setOrigin(0.5)
      .setStroke("#1a1a2e", 6);
    this.tweens.add({
      targets: t,
      y: y - 54,
      alpha: 0,
      duration: 1000,
      ease: "Cubic.out",
      onComplete: () => t.destroy(),
    });
  }

  /**
   * 코드 드로우 메테오 스폰 — codeMeteor 상태 객체 초기화.
   * 이미지 풀 불필요, drawCodeMeteor()가 매 프레임 렌더. 렌더 전용(D1).
   */
  private spawnMeteor(): void {
    // 한 번에 1~3개가 쏟아짐(최대 동시 MAX_METEORS까지만 누적).
    const burst = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < burst; k++) {
      if (this.codeMeteors.length >= MAX_METEORS) break;
      this.codeMeteors.push(this.makeMeteor());
    }
  }

  /** 메테오 1개 상태 생성(렌더 전용). */
  private makeMeteor(): CodeMeteor {
    const size = 14 + Math.random() * 12; // 본체 반지름(최종) 14~26px
    const startX = DESIGN_W * (0.1 + Math.random() * 0.8);
    const startY = 10 + Math.random() * 80;
    const endY = GROUND_Y_PX * (0.38 + Math.random() * 0.18); // 화면 중~하단 중간에서 소멸
    const driftX = (Math.random() - 0.65) * DESIGN_W * 0.22; // 약간 왼쪽으로 사선
    const endX = startX + driftX;
    const duration = 5800 + Math.random() * 3000; // 5.8~8.8s — 천천히

    // 꼬리 방향: 이동 방향의 반대 = 뒤로 드리움
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const tailAngle = Math.atan2(-dy / len, -dx / len);

    return { startX, startY, endX, endY, elapsed: 0, duration, size, tailAngle };
  }

  /**
   * 코드 드로우 메테오 렌더 — 난류처럼 일렁이는 화염 불덩이.
   * 구체+리본이 아니라 불혀(flame tongue) 다발 + 깜빡이는 코어 + 튀는 불티.
   * 여러 주파수 sin 합성으로 불규칙(이글이글) 난류를 흉내냄. 렌더 전용(D1).
   */
  private drawCodeMeteor(): void {
    const g = this.meteorGfx;
    g.clear();
    for (const m of this.codeMeteors) this.drawOneMeteor(g, m);
  }

  private drawOneMeteor(
    g: Phaser.GameObjects.Graphics,
    m: CodeMeteor,
  ): void {
    const rawProg = m.elapsed / m.duration; // 0 → 1
    const ease = rawProg * rawProg; // Quad.in — 처음엔 느리게 출발
    const x = m.startX + (m.endX - m.startX) * ease;
    const y = m.startY + (m.endY - m.startY) * ease;

    const alpha = 1 - rawProg; // 1→0: 내려갈수록 투명해짐
    const r = m.size * (0.1 + 0.9 * rawProg); // 코어 반지름: 점→원
    const t = this.renderTimeMs * 0.001;

    // 낙하 방향(dir)·꼬리 방향(t*)·진행축 수직(p*) 단위벡터
    const dx = m.endX - m.startX,
      dy = m.endY - m.startY;
    const L = Math.hypot(dx, dy) || 1;
    const dirx = dx / L,
      diry = dy / L;
    const tlx = -dirx,
      tly = -diry; // 꼬리(뒤)
    const pxx = -diry,
      pyy = dirx; // 좌우(흔들림 축)

    // ─── 1) 화염 꼬리 플룸 — 불혀 다발이 난류처럼 일렁임 (코어보다 먼저=아래) ───
    const tongues = 11;
    for (let i = 0; i < tongues; i++) {
      const n = i / (tongues - 1);
      const side = (n - 0.5) * 2; // -1..1
      const cd = Math.abs(side); // 0(중앙)~1(가장자리)
      // 난류: 3개 주파수 합성 → 불규칙 흔들림
      const turb =
        Math.sin(t * 7 + i * 1.7) * 0.5 +
        Math.sin(t * 13 + i * 3.1) * 0.3 +
        Math.sin(t * 23 + i) * 0.2;
      const flick = 0.6 + 0.4 * Math.sin(t * 11 + i * 2.3);
      // 중앙 불혀일수록 길게(꼬리가 길게 빠짐). 5.4 → 가장자리 2.6.
      const len = r * (5.4 - cd * 2.8) * (0.72 + 0.28 * flick);
      const baseOff = side * r * 0.46;
      const sx = x + pxx * baseOff,
        sy = y + pyy * baseOff;
      const sway = (side * 0.55 + turb * 0.5) * r * 1.5;
      const ex = sx + tlx * len + pxx * sway;
      const ey = sy + tly * len + pyy * sway;
      const color =
        cd < 0.25
          ? 0xffe066
          : cd < 0.55
            ? 0xff8c1a
            : cd < 0.8
              ? 0xff4d1a
              : 0xcc2200;
      // 밑변은 좁게 → 끝점으로 수렴하는 날카로운 삼각형(불꽃 혀).
      const halfW =
        Math.max(0.5, r * (0.42 - cd * 0.26)) * (0.6 + 0.4 * flick);
      const a = alpha * (0.5 - cd * 0.3) * (0.6 + 0.4 * flick);
      // 불혀 자체 방향의 수직으로 밑변 두 점을 잡고 tip(ex,ey)으로 모은다.
      const tdx = ex - sx,
        tdy = ey - sy;
      const tl = Math.hypot(tdx, tdy) || 1;
      const npx = -tdy / tl,
        npy = tdx / tl;
      g.fillStyle(color, Math.max(0, Math.min(0.85, a)));
      g.fillTriangle(
        sx + npx * halfW,
        sy + npy * halfW,
        sx - npx * halfW,
        sy - npy * halfW,
        ex,
        ey,
      );
    }

    // ─── 2) 불덩이 코어 — 불규칙하게 겹친 블롭(이글거림) ───
    g.fillStyle(0xff4d1a, alpha * 0.3); // 바깥 붉은 글로우
    g.fillCircle(x, y, r * 1.5 + Math.sin(t * 9) * r * 0.12);
    for (let i = 0; i < 6; i++) {
      // 흔들리는 외곽 블롭
      const a2 = (i / 6) * Math.PI * 2 + t * 2;
      const rr = r * (0.78 + 0.18 * Math.sin(t * 8 + i));
      g.fillStyle(0xe63312, alpha * 0.7);
      g.fillCircle(
        x + Math.cos(a2) * r * 0.2,
        y + Math.sin(a2) * r * 0.2,
        rr * 0.6,
      );
    }
    g.fillStyle(0xff7a1a, alpha * 0.85); // 주황 중간층
    g.fillCircle(
      x - dirx * r * 0.1,
      y - diry * r * 0.1,
      r * 0.62 + Math.sin(t * 14) * r * 0.06,
    );
    g.fillStyle(0xffd24d, alpha * 0.95); // 밝은 코어
    g.fillCircle(x - dirx * r * 0.15, y - diry * r * 0.15, r * 0.34);
    g.fillStyle(0xfff2cc, alpha * 0.9); // 백열 중심
    g.fillCircle(x - dirx * r * 0.18, y - diry * r * 0.18, r * 0.16);

    // ─── 3) 튀는 불티(ember) ───
    for (let i = 0; i < 4; i++) {
      const ph = t * (3 + i) + i * 2.1;
      const ed = (ph % 2) / 2; // 0..1 수명
      const ang = m.tailAngle + Math.sin(ph * 5 + i) * 0.7;
      const dist = r * (1.2 + ed * 3.5);
      const exx = x + Math.cos(ang) * dist,
        eyy = y + Math.sin(ang) * dist;
      g.fillStyle(0xffcc66, alpha * (1 - ed) * 0.8);
      g.fillCircle(exx, eyy, Math.max(0.6, r * 0.1 * (1 - ed)));
    }
  }

  // ─── #11 가로형 랭킹 패널 ────────────────────────────────────────────────────
  // panel[0]=플레이어, panel[1..3]=상위3고스트. 순위 변화 시 컨테이너 x를 tween으로 이동.
  // 렌더 전용 — sim 읽기만, 결정론 무관.
  private updateRankPanel(): void {
    const s = this.sim.state;
    const n = Math.min(3, this.ghosts.length); // 활성 고스트 패널 수 (0~3)
    const total = n + 1; // 전체 패널 수 (고스트 + 플레이어)

    // 고스트 없거나 게임오버: 패널 숨김
    if (n === 0) {
      for (const p of this.rankPanels) p.setVisible(false);
      return;
    }

    // panel[0]=플레이어 거리(실시간), panel[1..n]=고스트 최종거리(고정)
    const dists: number[] = [
      s.distance,
      this.top3GhostDists[0] ?? -1,
      this.top3GhostDists[1] ?? -1,
      this.top3GhostDists[2] ?? -1,
    ];

    // 순위 = 거리 내림차순 정렬 → 각 패널이 표시될 슬롯(0=1등) 계산
    const panelCount = total; // 4 or less
    const slotOfPanel = new Array<number>(4).fill(-1);
    const sorted = Array.from({ length: panelCount }, (_, i) => i).sort(
      (a, b) => dists[b]! - dists[a]!,
    );
    sorted.forEach((panelIdx, slot) => {
      slotOfPanel[panelIdx] = slot;
    });

    // 패널 가로 배치 상수 (매 프레임 재계산 — total 변화 대응)
    const PW = 240,
      PG = 8;
    const totalW = panelCount * PW + (panelCount - 1) * PG;
    const startX = (DESIGN_W - totalW) / 2;
    const slotX = (slot: number) => startX + slot * (PW + PG);

    for (let i = 0; i < 4; i++) {
      const slot = slotOfPanel[i];
      const panel = this.rankPanels[i]!;
      const active = slot !== -1 && i < total;
      panel.setVisible(active);
      if (!active) continue;

      const targetX = slotX(slot!);
      const dx = Math.abs(panel.x - targetX);
      if (dx > 2 && !this.tweens.isTweening(panel)) {
        this.tweens.add({
          targets: panel,
          x: targetX,
          duration: dx > 400 ? 350 : 650, // 초기 플라이인=빠름, 순위변경=느림
          ease: dx > 400 ? "Cubic.out" : "Back.out",
        });
      }
    }

    // 텍스트 갱신: 플레이어 실시간 거리
    this.rankPanelTexts[0]!.setText(`YOU  ${Math.floor(s.distance)}m`);

    // 텍스트 갱신: 고스트 최종거리 + 현재 슬롯(순위) 표시
    // 로컬 기록(내 것) → "YOU", 원격 기록(타인) → "G#"
    for (let g = 0; g < n; g++) {
      const dist = Math.floor(this.top3GhostDists[g] ?? 0);
      const gSlot = slotOfPanel[g + 1] ?? g; // 현재 표시 슬롯
      const rankLabel = `#${gSlot + 1}`;
      const gLabel = this.ghostsAreOwnRecords ? "YOU" : `G${g + 1}`;
      this.rankPanelTexts[g + 1]!.setText(`${rankLabel} ${gLabel}  ${dist}m`);
    }
  }

  // ─── 코드로 그리는 레트로웨이브 태양 ───────────────────────────────────────
  // sunGraphics.setPosition(0, 214) 이므로 드로우 좌표 y=0 이 scene y=214 (태양 센터).
  // Math.sin 허용 구역 (렌더 전용).
  private updateCodeSun(): void {
    const cx = DESIGN_W * 0.5;
    const r = 112;
    const t = this.renderTimeMs * 0.001;
    const g = this.sunGraphics;
    g.clear();

    // ─── 0) 외곽 블룸 헤일로 — 빛이 사방으로 번지는 광배.
    //     Graphics는 postFX(가우시안 블러) 미지원이라, 큰→작은 동심원을 낮은 알파로
    //     겹쳐 부드러운 방사형 그라데이션(블러 효과)을 직접 합성한다. 맥동 포함.
    const bloomPulse = 1 + 0.05 * Math.sin(t * 0.9);
    const BLOOM_LAYERS = 18;
    for (let i = BLOOM_LAYERS; i >= 1; i--) {
      const f = i / BLOOM_LAYERS; // 1(바깥)→0(안)
      const rr = r * (0.96 + 1.05 * f) * bloomPulse;
      const a = 0.045 * (1 - f) + 0.01; // 바깥일수록 옅게 → 빛 번짐
      g.fillStyle(this.lerpColor(0xff9a5a, 0xff6688, f), a);
      g.fillCircle(cx, 0, rr);
    }

    // ─── 1) 디스크 본체 — 가로 스캔라인 그라데이션.
    //     1.5px 간격(겹침)으로 촘촘히 + 좌우 7px 부드러운 페더 → 곡면 가장자리 계단 제거.
    const FEATHER = 7;
    for (let dy = -r; dy <= r; dy += 1.5) {
      const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (hw < 1) continue;
      const fy = (dy + r) / (2 * r);
      const color = this.sunGradientColor(fy);
      const coreW = hw * 2 - FEATHER * 2;
      if (coreW > 0) {
        g.fillStyle(color, 1);
        g.fillRect(cx - hw + FEATHER, dy, coreW, 2);
      }
      // 좌우 페이더: 부드러운 알파 램프(곡선) → 가장자리 빛처럼 풀림
      const edgeLen = Math.min(FEATHER, hw);
      for (let fi = 0; fi < edgeLen; fi++) {
        const fa = Math.pow((fi + 1) / (FEATHER + 1), 1.3);
        g.fillStyle(color, fa);
        g.fillRect(cx - hw + fi, dy, 1.2, 2); // 왼쪽
        g.fillRect(cx + hw - fi - 1, dy, 1.2, 2); // 오른쪽
      }
    }

    // ─── 1b) 중심 코어 광채 — 큰 소프트 원 몇 겹으로 가운데가 환하게 번지도록.
    for (let i = 4; i >= 1; i--) {
      const f = i / 4;
      g.fillStyle(0xfff2d8, 0.06 * (1 - f) + 0.03);
      g.fillCircle(cx, -r * 0.12, r * (0.3 + 0.55 * f));
    }

    // 레트로웨이브 줄무늬 (하단 절반, 원근 압축 + 일렁임)
    const stripeCount = 9;
    for (let i = 0; i < stripeCount; i++) {
      const frac = (i + 1) / (stripeCount + 1);
      const baseLocal = frac * frac * r * 0.97; // 이차 압축 → 아래로 갈수록 밀집
      const shimmer = Math.sin(t * 2.1 + i * 0.85) * 1.8;
      const yLocal = baseLocal + shimmer;
      if (yLocal < 0 || yLocal >= r) continue;
      const hw2 = Math.sqrt(Math.max(0, r * r - yLocal * yLocal));
      const thickness = Math.max(1.5, 3.8 - i * 0.24);
      const sa = 0.5 + 0.22 * Math.sin(t * 1.6 + i * 0.55);
      g.fillStyle(0xfff5e0, sa);
      g.fillRect(cx - hw2, yLocal, hw2 * 2, thickness);
    }

    // 외곽 글로우 링 — 맥동
    const glowR = r + 5 + Math.sin(t * 0.88) * 4;
    g.lineStyle(5, 0xff7799, 0.18 + 0.08 * Math.sin(t * 1.05));
    g.strokeCircle(cx, 0, glowR);
    g.lineStyle(2.5, 0xffaa66, 0.1 + 0.06 * Math.sin(t * 0.65));
    g.strokeCircle(cx, 0, glowR + 8);
  }

  private sunGradientColor(fy: number): number {
    // 상단: 진한 오렌지 → 중간: 크림 → 하단: 분홍
    if (fy < 0.35) return this.lerpColor(0xff7030, 0xffb870, fy / 0.35);
    if (fy < 0.65) return this.lerpColor(0xffb870, 0xffe8c0, (fy - 0.35) / 0.3);
    return this.lerpColor(0xffe8c0, 0xff90b0, (fy - 0.65) / 0.35);
  }

  private lerpColor(c1: number, c2: number, t: number): number {
    const u = Math.max(0, Math.min(1, t));
    const r1 = (c1 >> 16) & 0xff,
      g1 = (c1 >> 8) & 0xff,
      b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff,
      g2 = (c2 >> 8) & 0xff,
      b2 = c2 & 0xff;
    return (
      (Math.round(r1 + (r2 - r1) * u) << 16) |
      (Math.round(g1 + (g2 - g1) * u) << 8) |
      Math.round(b1 + (b2 - b1) * u)
    );
  }

  // 빨간 레이저 경고 이펙트 — 렌더 전용 (Math.sin 허용, 결정론 무관)
  private drawLasers(): void {
    const g = this.laserGraphics;
    g.clear();
    const t = this.renderTimeMs * 0.001; // 초 단위
    const s = this.sim.state;
    if (s.gameOver) return;

    // 속도가 빨라질수록 레이저 강도 강해짐 + 게임 시작부터 기본 강도 유지
    const speedRange = C.SPEED_MAX - C.SPEED_BASE; // 320
    const speedFactor = Math.min(1, (s.speed - C.SPEED_BASE) / speedRange); // 0→1
    const baseAlpha = 0.18 + speedFactor * 0.24; // 항상 0.18 이상, 최대 0.42
    const fever = s.feverFramesLeft > 0;

    // 레이저 3줄기 — 단순 sin 스윕. yMid는 태양 세로 범위(y≈102~326) 내에 고정.
    // 태양: 씬 y=214, r=112 → scene top=102, bottom=326. yMid 고정으로 선의 중간점
    // 항상 태양 내부. 흔들리는 양끝(y1, y2)은 범위를 벗어나도 무방.
    const beams = [
      { yMid: 128, freq: 0.78, amp: 110, width: 2.5, color: 0xff4757 },
      { yMid: 205, freq: -0.52, amp: 90, width: 1.8, color: 0xff6b81 },
      { yMid: 272, freq: 1.0, amp: 140, width: 3.0, color: 0xff4757 },
    ] as const;

    for (const b of beams) {
      const sweep = Math.sin(t * b.freq * Math.PI * 2);
      // y1(좌끝)과 y2(우끝)가 반대 방향으로 흔들려 사선 느낌 유지
      const y1 = b.yMid + sweep * b.amp;
      const y2 = b.yMid - sweep * b.amp;
      const color = fever ? 0xffd700 : b.color;
      const alpha = baseAlpha * (fever ? 1.8 : 1);
      g.lineStyle(b.width, color, Math.min(0.55, alpha));
      g.beginPath();
      g.moveTo(0, y1);
      g.lineTo(DESIGN_W, y2);
      g.strokePath();
    }
  }
}
