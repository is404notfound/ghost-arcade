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
import {
  loadTopRunsRemote,
  submitRunRemote,
  loadWeeklyRankings,
  type WeeklyRank,
} from "../remoteStore";
import { getUserId, getNickname, deterministicNickname } from "../identity";
import { RENDER_DPR } from "./dpr";
import { compareGhosts, type GhostComparison } from "./ghostCompare";
import {
  DESIGN_W,
  DESIGN_H,
  GROUND_Y_PX,
  toScreenX,
  toScreenY,
  boxCenterScreenY,
} from "./viewport";
import {
  registerPauseToggle,
  setPauseButtonState,
  registerRestart,
  setRestartButtonVisible,
} from "../controls";
import { track } from "../analytics";

// 게임 에셋(전처리본 assets/game/*) — Vite가 해시 URL로 번들. scripts/prep-assets.py 산출물.
import playerRideUrl from "../../assets/game/player-ride.png";
import playerJump1Url from "../../assets/game/player-jump1.png";
import playerJump2Url from "../../assets/game/player-jump2.png";
import playerHitUrl from "../../assets/game/player-hit.png";
import playerDeadUrl from "../../assets/game/player-dead.png";
import ghostRunSheetUrl from "../../assets/game/ghost-run.png";
import ghostCollapseUrl from "../../assets/game/ghost-collapse.png";
import fuelCanUrl from "../../assets/game/fuel-can.png";
import obsCarUrl from "../../assets/game/obs-car.png";
import obsBarrelUrl from "../../assets/game/obs-barrel.png";
import obsDebrisUrl from "../../assets/game/obs-debris.png";
import obsBarricadeUrl from "../../assets/game/obs-barricade.png";
import obsVendingUrl from "../../assets/game/obs-vending.png";
import obsFissureUrl from "../../assets/game/obs-fissure.png";
import hpFrameUrl from "../../assets/game/hp-frame.png";
// 원경 배경 레이어 3종 — 시차 TileSprite (prep-bg.py 산출물)
import bgBuildingsFarUrl from "../../assets/game/bg-buildings-far.png";
import bgBridgesFarUrl from "../../assets/game/bg-bridges-far.png";
import bgBridgesCurvedFarUrl from "../../assets/game/bg-bridges-curved-far.png";
// UI 패널 — 9-slice 프레임 (prep-panels.py 산출물)
import panelRankHudUrl from "../../assets/game/panel-rank-hud.png";
import panelRankHudGoldUrl from "../../assets/game/panel-rank-hud-gold.png";
import panelDailyUrl from "../../assets/game/panel-daily.png";
import panelWeeklyUrl from "../../assets/game/panel-weekly.png";
import panelGameoverUrl from "../../assets/game/panel-gameover.png";
import panelTutorialUrl from "../../assets/game/panel-tutorial.png";
import btnReplayUrl from "../../assets/game/btn-replay.png";
import introSlideUrl from "../../assets/game/intro-slide.png";
// flame-pilar 이미지 제거됨 — 코드 드로우 화염분수(code-flame-*)로 교체
// warn-bubble 이미지 제거됨 — 코드 드로우 스파이크 뱃지(makeSpikeBadge)로 교체
// bg-sun 이미지는 코드 태양(createCodeSun)으로 대체 — import 제거
// fx-meteor-*: 코드 드로우 메테오(drawCodeMeteor)로 대체 — import 제거
// 일본어 네온 간판 데코 (배경 패럴랙스 레이어)
import signYakouUrl from "../../assets/images/signage/signage-yakou.png";
import signHotelUrl from "../../assets/images/signage/signage-hotel.png";
import signMusicUrl from "../../assets/images/signage/signage-music-bar.png";
import signShinyaUrl from "../../assets/images/signage/signage-shinya.png";

const COLOR_GHOST = 0xb39ddb; // 고스트 — 보라 계열 반투명(스프라이트 틴트)

// 텍스트 렌더 해상도 — Phaser Text는 기본 1x라 작은/저DPR 화면에서 자글거린다.
// 카메라 줌(RENDER_DPR)으로 확대되는 만큼 글리프 텍스처를 미리 크게 렌더해 1:1 매핑.
// 하한 2는 데스크톱(DPR 1)에서도 슈퍼샘플링으로 또렷하게. config.resolution이
// Phaser 3.90에서 제거되어 텍스트마다 개별 지정해야 하므로 단일 상수로 통일한다.
const TXT_RES = Math.max(RENDER_DPR, 2);

/** HUD 영숫자 — Oxanium(스코어보드/HUD용). Orbitron보다 소형 칩에서 획이 덜 뭉개짐. */
const FONT_HUD = "'Oxanium', sans-serif";
/** 한국어 카피·말풍선 */
const FONT_KR = "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif";

// 배경(코드 스킨) 팔레트 — docs/design/asset-guide.md §3 컬러 토큰. 전부 렌더 전용.
// 하늘 색은 BIOMES[0](기본 노을 팔레트)로 이동 — 바이옴 전환 도입
const COLOR_NEON_CYAN = 0x36f9f6; // 바닥 그리드 / 지평선 글로우
const COLOR_SKYLINE = 0x1b0c33; // 먼 도시 실루엣
const COLOR_SKYLINE_WIN = 0xff6fb0; // 실루엣 창문 점
const COLOR_GROUND_DARK = 0x0a0612; // 지면(지평선 아래)

// ── 바이옴 팔레트 — 1000m마다 순환 전환 (장거리 지루함 대책 2, 렌더 전용) ──
// 하늘 그라데이션 + 바닥 베이스 + 그리드 네온만 바꾼다. 태양·간판·게임플레이 4색
// (플레이어/고스트/연료/위험)은 불변 — 색이 곧 정보라는 규칙(asset-guide §3)을 지킨다.
interface BiomePalette {
  skyTop: number;
  skyLow: number;
  groundTop: number;
  grid: number;
}
const BIOMES: readonly BiomePalette[] = [
  // 0: 세기말 노을 (기존 기본)
  { skyTop: 0x170a2e, skyLow: 0x6b1248, groundTop: 0x301552, grid: COLOR_NEON_CYAN },
  // 1: 심야 블루 — 도시가 잠든 딥 블루 구역
  { skyTop: 0x05071f, skyLow: 0x12275e, groundTop: 0x101c4a, grid: 0x5e8bff },
  // 2: 독성 그린 — 오염 구역의 형광 녹색
  { skyTop: 0x041712, skyLow: 0x0e5a3a, groundTop: 0x0e3d2e, grid: 0x50ffb0 },
  // 3: 심홍 — 화재 구역의 붉은 하늘
  { skyTop: 0x1f060e, skyLow: 0x7a1430, groundTop: 0x4a0f28, grid: 0xff5f7a },
];
const BIOME_METERS = 1000; // 구간 길이(m)
const BIOME_FADE_MS = 3500; // 크로스페이드 시간 — 원경 타일·하늘이 같이 녹아 바뀌게 (휙 스왑 방지)

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

function blendBiome(a: BiomePalette, b: BiomePalette, t: number): BiomePalette {
  return {
    skyTop: lerpColor(a.skyTop, b.skyTop, t),
    skyLow: lerpColor(a.skyLow, b.skyLow, t),
    groundTop: lerpColor(a.groundTop, b.groundTop, t),
    grid: lerpColor(a.grid, b.grid, t),
  };
}

// ── 연막(Blackout) 트랩 — 우측 절반 시야 차단 (렌더 전용, 장거리 스파이스) ──
// 발동 지점은 (시드)만의 순수 함수 → 같은 시드의 모든 유저가 같은 거리에서 겪는다
// (리더보드 공정성). sim은 전혀 건드리지 않으므로 버전·고스트 무관.
// 예고 1.2s(플리커 + ⚠) → 우측 끝에서 연기가 밀려오듯 스윕인 0.9s → 유지 →
// 부드러운 페이드아웃 0.8s. 색은 검정 대신 짙은 연기 회색 + 경계 일렁임.
const BLACKOUT_START_M = 1000; // 첫 발동 최소 거리 — 초반 유저는 안 만난다
const BLACKOUT_GAP_MIN_M = 700; // 발동 간 최소 간격(m)
const BLACKOUT_GAP_JITTER_M = 500; // 간격 지터(m) — 시드 LCG로 결정
const BLACKOUT_WARN_MS = 2200; // 예고(플리커) 시간 — 너무 짧으면 인지 전에 사라짐
const BLACKOUT_SWEEP_IN_MS = 900; // 연기 스윕인 — 우측 끝→중앙까지 천천히 덮임
const BLACKOUT_DARK_MS = 3000; // 차단 유지(스윕인 포함)
const BLACKOUT_FADE_OUT_MS = 900; // 스윕아웃(왼쪽부터 걷힘 → 우측으로 밀려남)
const BLACKOUT_MAX_ALPHA = 1; // 완전 차단 — 실루엣도 안 보이게 (플레이 피드백)
const BLACKOUT_COLOR = 0x1a1a20; // 더 짙은 연기 회색 (검정보다 살짝 밝은 톤만 유지)
// 0.45→0.7: 절반 차단은 너무 어렵다는 플레이 피드백 — 우측 30%만 차단
const BLACKOUT_EDGE0 = DESIGN_W * 0.7; // 스윕 완료 시 솔리드 차단 시작 (여기부터 우측 끝까지)
const BLACKOUT_GRAD_W = DESIGN_W * 0.1; // 경계 그라데이션 폭
type BlackoutPhase = "idle" | "warn" | "dark" | "recover";
const SKYLINE_PARALLAX = 0.2; // 먼 스카이라인 스크롤 배수(월드속도 대비)
const GRID_SPACING = 70; // 바닥 그리드 수직선 간격(px)
const DEAD_PLAYER_ALPHA = 0.25; // 사망 후 내 캐릭터 디밍

// 스프라이트 표시 튜닝 — 아트는 풋프린트(히트박스)보다 크게 overhang 허용(스펙 §1).
// 충돌은 sim의 직사각형 풋프린트로만 판정되므로 아래 값은 '보이는 크기'일 뿐이다.
// 라이더 표시 높이(px) — 히트박스 42 + 후드/스카프 overhang.
// 78→96: 6프레임 시트(347×300, 세로형)는 구 정지컷(417×192, 가로형)보다 종횡비가 좁아
// 같은 높이면 시각 면적이 ~35% 줄어 "주인공이 작아졌다"로 인지됨 — 면적 기준으로 복원.
const PLAYER_ART_H = 96;
// [Tier B] jump1/jump2/hit 공통 표시 높이: prep-player-jump.py + prep-player-hit.py로
// 뒷바퀴 지름을 ride 기준으로 구워넣었으므로 세 컷 모두 이 하나의 값으로 setDisplaySize.
// 유도: PLAYER_ART_H × (COMMON_CANVAS_H / RIDE_TARGET_H) = 96 × 476/300 = 152.
const JUMP_HIT_ART_H = 152;
const PLAYER_ART_ORIGIN_X = 0.62; // 아트 내 히트박스 정렬점(왼쪽 트레일 보정 → 우측 치우침)
const PLAYER_ART_ORIGIN_Y = 0.96; // 바퀴 접지점이 바닥선에 닿도록
// 고스트 러너 표시 높이. 90→104: 배경이 화려해 반투명·소형 고스트가 안 보임 →
// 주인공(96)보다 살짝 크게 + 알파 1.0으로 실루엣 가시성 확보 (히트박스는 sim 그대로).
const INTRO_MS = 8500; // 세로 슬라이드 — 천천히 감상 (Next로만 종료)
const GHOST_ART_H = 104;
const GHOST_SPRITE_ALPHA = 1; // 100% 불투명 — 네온 배경에 묻히지 않게
const FUEL_ART_SIZE = 50; // 연료통 표시 한 변(px) — 100→50: 과대 크기 절반으로 축소
const GHOST_RUN_FPS = 12; // 고스트 달리기 6프레임 사이클 속도(렌더 전용) — 12fps=0.5s/cycle
// 고스트 x 분산 오프셋 — 렌더 전용. 충돌·거리 판정과 무관.
// 한 덩어리로 겹치지 않게 주인공 주변으로 흩어뜨림(주로 뒤쪽에).
const GHOST_X_OFFSETS = [-72, -42, -20, 18, 40, 64, -54, 32, -10, 50] as const; // 너무 퍼지지 않도록 줄임

const MAX_METEORS = 4; // 동시 메테오 상한 — 드로우 비용 완화

// 장애물 아트 텍스처 키(렌더 전용·결정론 무관). 건물은 더 이상 쓰지 않는다.
// code-sludge(초록 오염수 분수)는 "장애물처럼 안 보인다"는 피드백으로 스폰 풀에서 제거.
// drawSludgeFountain/스모크 프로파일은 추후 재테마 가능성 위해 남겨두되 더 이상 선택되지 않음.
// OBS_MID → 낮은 슬롯에서도 읽히는 단순 실루엣 vs 디테일이 있어 중간 이상에서만 나올 것으로 분리.
const OBS_LOWSAFE = ["obs-car", "obs-debris", "obs-barrel"] as const; // 1단·낮은 h에서도 읽히는 단순 실루엣
const OBS_MID_DETAIL = ["obs-barricade", "obs-vending"] as const; // 디테일 → h>80 이상에서만 출현
const OBS_TALL = ["code-flame-s", "code-flame-m", "code-flame-l", "obs-fissure"] as const; // 화염분수 3종 + 용암암맥

// 장애물 아트 폭/높이 상수 (렌더 전용)
const OBSTACLE_ART_SCALE = 1.2; // 시각 크기 살짝 키움(히트박스는 sim의 o.h 유지)
const OBSTACLE_MIN_W = 40; // 히트박스(OBS_W=32)를 덮는 최소 폭
const OBSTACLE_MAX_W = 150; // 과도한 가로 오버행 방지 상한
// 히트박스 대비 시각 폭 상한 — 표시 폭이 판정 폭의 4배(예: 차 150px vs 32px)까지
// 벌어지면 "겹쳐 보이는데 안 맞는" 히트박스 버그로 인지됨. 오버행을 히트박스에 연동해 제한.
const OBSTACLE_OVERHANG_PX = 30;
// 불(barrel)·돌(barricade)은 주인공보다 작아도 됨. 그외 인공물(car/debris/vending/fissure)은
// '기본적으로 주인공보다 크게' 보이도록 최소 표시 높이를 보장하고, 넓은 폭 상한을 준다.
// (주인공 화면 높이 ≈ 94px → 그보다 크게)
const OBSTACLE_MIN_ART_H = 108;
const OBSTACLE_BIG_MAX_W = 176; // 그외 인공물의 폭 상한(초과 시 찌부 대신 균일 축소)
const OBSTACLE_SMALL_OK = new Set(["obs-barrel", "obs-barricade"]); // 작아도 되는 불/돌

/**
 * 높이(o.h)·판정 폭(o.w)에 맞는 후보군에서 '최근 2개 히스토리와 다른' 타입을 골라 인접 중복을 막는다.
 * 렌더 전용 — 충돌·거리 판정과 무관(연출).
 *
 * 높이 게이트:
 *   h > OBS_H_MAX  → OBS_TALL 전용(불기둥)
 *   h > 80         → OBS_MID_DETAIL + OBS_LOWSAFE(배럴) + OBS_TALL
 *   else(1단/낮음) → OBS_LOWSAFE 전용 (barricade·vending 제외 → 작아도 읽히는 실루엣만)
 *
 * 히스토리 회피: lastTypes(최대 2)에 있는 인공물 계열만 제외.
 * 불/용암(code-flame·obs-fissure)은 자연 반복 허용이므로 히스토리에서 제외.
 */
function pickObstacleType(h: number, w: number, lastTypes: string[]): string {
  let pool: readonly string[];
  if (h > C.OBS_H_MAX)
    pool = OBS_TALL;
  else if (h > 80) pool = [...OBS_MID_DETAIL, "obs-barrel", ...OBS_TALL];
  else pool = OBS_LOWSAFE;
  // 차(원본 종횡비 3.1)는 좁은 히트박스(w=32)에선 폭 캡으로 뭉개짐 — 넓은 장애물 전용
  if (w < 48) pool = pool.filter((k) => k !== "obs-car");
  if (pool.length === 0) pool = OBS_LOWSAFE;
  // 인공물 계열만 히스토리 회피 (불·용암은 자연 반복 허용)
  const isArtifact = (k: string) => !k.startsWith("code-") && k !== "obs-fissure";
  const avoid = pool.filter(
    (k) => !(isArtifact(k) && lastTypes.includes(k)),
  );
  // cands 비면 마지막 1개만 회피로 폴백
  const cands =
    avoid.length > 0
      ? avoid
      : pool.filter((k) => k !== lastTypes[lastTypes.length - 1]);
  const finalPool = cands.length > 0 ? cands : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)]!;
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
      return {
        color: 0x9b8f86,
        strands: 3,
        height: 30,
        baseW: 5.5,
        alpha: 0.3,
        spread: 11,
        sway: 16,
        freq: 1.5,
        ember: false,
        glow: 0xff5a7a,
        fire: false,
      };
    case "obs-barrel": // 드럼통: 검고 높은 매연 + 불씨 밑동
      return {
        color: 0x655e6c,
        strands: 2,
        height: 56,
        baseW: 5,
        alpha: 0.42,
        spread: 6,
        sway: 12,
        freq: 2.2,
        ember: true,
        glow: 0xff7a3c,
        fire: true,
      };
    case "code-flame-s":
    case "code-flame-m":
    case "code-flame-l": // 코드 드로우 화염분수 — 연기는 거의 없고 빛이 강함
      return {
        color: 0x7a6a72,
        strands: 1,
        height: 30,
        baseW: 3,
        alpha: 0.18,
        spread: 0,
        sway: 9,
        freq: 2.8,
        ember: true,
        glow: 0xff9a3c,
        fire: true,
      };
    case "code-sludge": // 오염수 분수 — 회색/녹색 연기
      return {
        color: 0x5a6655,
        strands: 2,
        height: 38,
        baseW: 4,
        alpha: 0.28,
        spread: 5,
        sway: 10,
        freq: 1.8,
        ember: false,
        glow: 0x7fff6a,
        fire: false,
      };
    case "obs-barricade": // 바리케이드: 낮은 흙먼지·모래 — obs-debris와 같은 계열, 불 없음
      return {
        color: 0xa09080,
        strands: 3,
        height: 28,
        baseW: 5,
        alpha: 0.28,
        spread: 10,
        sway: 15,
        freq: 1.4,
        ember: false,
        glow: 0xff5a7a,
        fire: false,
      };
    case "obs-vending": // 자판기: 마젠타·시안 전기 스파크 글로우, 불꽃 없음
      return {
        color: 0x36f9f6,
        strands: 2,
        height: 44,
        baseW: 3.5,
        alpha: 0.25,
        spread: 5,
        sway: 8,
        freq: 3.2,
        ember: false,
        glow: 0xff2de1,
        fire: false,
      };
    case "obs-fissure": // 실제 아트=부서진 벽돌 벽(불 없음) → 연기/엠버 없음
      return {
        color: 0x8a5a3a,
        strands: 3,
        height: 60,
        baseW: 5,
        alpha: 0.38,
        spread: 9,
        sway: 14,
        freq: 1.8,
        ember: false,
        glow: 0xff6a20,
        fire: false,
      };
    case "obs-car": // 부서진 차: 엔진룸 회색 연기 + 시안 네온 잔광
    default:
      return {
        color: 0xb8b2c0,
        strands: 2,
        height: 42,
        baseW: 4.5,
        alpha: 0.32,
        spread: 8,
        sway: 13,
        freq: 2.0,
        ember: false,
        glow: 0x2de1ff,
        fire: false,
      };
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

  // 구경 모드 제거됨: 게임오버 시 모든 고스트가 함께 쓰러지고 즉시 결과로 전환.
  private spectating = false;

  private paceText!: Phaser.GameObjects.Text; // 현재 등수 "N / M등"
  private overtakeHudText!: Phaser.GameObjects.Text; // "제침 X/N"
  private comboRibbon!: Phaser.GameObjects.Container; // 좌측 끝 콤보 띠지 (좌→우 슬라이드)
  private comboRibbonBg!: Phaser.GameObjects.Rectangle;
  private comboDisplay!: Phaser.GameObjects.Text; // 띠지 위 콤보 숫자 (combo >= 2)
  private comboRibbonVisible = false; // 슬라이드 인/아웃 중복 방지
  private prevCombo = 0; // 이전 프레임 combo 값 — 증가 감지용
  private prevRank = 0; // 이전 프레임 등수 — 상승 감지용
  private feverCount = 0; // 이번 판 피버 발동 횟수 — game_over 이벤트용
  // 결과 패널 딜레이 타이머 — 재시작 시 반드시 취소해야 새 게임 중에 패널이 안 뜸
  private resultPanelTimer: Phaser.Time.TimerEvent | null = null;
  // 플레이어 사망 페이드아웃 — 트윈을 한 번만 시작하기 위한 플래그 (렌더 전용)
  private playerDeadFadeStarted = false;
  private crashed = false; // 렌더 루프 예외 발생 시 1회만 보고하고 정지 (이벤트 폭주 방지)
  private gamePaused = false;
  // 인게임 안내
  private startOverlay!: Phaser.GameObjects.Container; // 판 시작마다 표시되는 오버레이
  private introOverlay!: Phaser.GameObjects.Container; // 첫 진입 세로 슬라이드 인트로 (§6.3)
  private introImage!: Phaser.GameObjects.Image;
  private introActive = false;
  private introNextBtn!: Phaser.GameObjects.Text;
  private startBestRankText!: Phaser.GameObjects.Text; // 최고 등수 (이력 있으면 표시)
  private startSubText!: Phaser.GameObjects.Text; // 고스트 경쟁 안내 / 첫판 조작 힌트
  private feverTutorial: Phaser.GameObjects.Container | null = null; // 첫 피버 일시정지 안내
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
  // 고스트 머리 위 순위 라벨 (#1 #2 #3) — 렌더 전용, 결정론 무관.
  private ghostRankLabels: Phaser.GameObjects.Text[] = [];
  // 고스트 엎어짐 연출 상태 — 기록 종료(finished) 시 1회 텀블 후 done. 렌더 전용.
  private ghostTumbleState: ("run" | "tumbling" | "done")[] = [];
  private playerRect!: Phaser.GameObjects.Sprite; // 후드 라이더 + 네온 오토바이
  // sim의 고정 크기 풀과 1:1 매핑 — 생성은 create()에서 단 한 번 (D6)
  private obstacleRects: Phaser.GameObjects.Image[] = []; // 아포칼립스 장애물(가변 높이)
  private obstacleType: string[] = []; // 슬롯별 배정된 아트 타입 키
  private obstacleWasActive: boolean[] = []; // 활성 전이(스폰) 감지용
  private lastObstacleTypes: string[] = []; // 최근 2개 배정 타입 히스토리 — 인접 중복 방지
  private fuelSprites: Phaser.GameObjects.Image[] = []; // 연료통(회복=주유)

  // 배경 패럴랙스 레이어 (렌더 전용 — sim 무관, world.distance만 읽어 스크롤)
  private bgSkylineFar!: Phaser.GameObjects.Container;
  // 원경 이미지 TileSprite 3종 — 바이옴 스왑, 시차 0.3×
  private bgBuildingsTile!: Phaser.GameObjects.TileSprite;
  private bgBridgesTile!: Phaser.GameObjects.TileSprite;
  private bgBridgesCurvedTile!: Phaser.GameObjects.TileSprite;
  private sunGraphics!: Phaser.GameObjects.Graphics; // 코드 태양 — 렌더 전용 (일렁 애니 포함)
  private starGfx!: Phaser.GameObjects.Graphics; // 밤하늘 네온 노란 별 — 렌더 전용
  private starField: { x: number; y: number; r: number; phase: number; tw: number }[] =
    [];
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
  // ── 바이옴 전환 상태 (렌더 전용) ──
  private skyGfx!: Phaser.GameObjects.Graphics;
  private biomeFrom = 0; // 페이드 시작 팔레트 인덱스
  private biomeTo = 0; // 목표 팔레트 인덱스
  private biomeMix = 1; // 0→1 크로스페이드 진행 (1 = 정착)
  private biomeLastMs = 0; // mix 적분용 직전 renderTimeMs
  private lastKmMilestone = 0; // 마일스톤 팡파레 중복 방지
  private zoomPunch = { t: 0 }; // 펀치 줌 트윈 상태 (0 = 기본 줌)
  private sunRedrawAccMs = 0; // 태양 재드로우 누적 ms (≈10fps 스로틀)
  private starRedrawAccMs = 0; // 별 반짝임 재드로우 누적 ms (≈10fps)
  private fxRedrawAccMs = 0; // 화염·연기·메테오·트레일 등 고비용 이펙트 (≈20fps)
  // ── 정전 트랩 상태 (렌더 전용) ──
  private blackoutGfx!: Phaser.GameObjects.Graphics;
  /** 암전 예고 — 코드 드로우 스파이크 WARNING 뱃지 (에셋 미사용) */
  private warnBadge!: Phaser.GameObjects.Container;
  /** 피버 — 코드 드로우 스파이크 FEVER! 뱃지 (우측 하단, 띠지 대체) */
  private feverBadge!: Phaser.GameObjects.Container;
  private feverBadgeVisible = false;
  private rankHudLabel!: Phaser.GameObjects.Text; // 「👑 TODAY」 안내
  private blackoutPhase: BlackoutPhase = "idle";
  private blackoutPhaseStartMs = 0; // 현재 phase 진입 시점(renderTimeMs)
  private blackoutNextAtM = Infinity; // 다음 발동 거리(m) — 시드 LCG로 갱신
  private blackoutLcg = 0; // 발동 간격 결정용 LCG 상태 (시드에서 파생)
  // 오글거리는 랜덤 말풍선 — 일정 간격마다 표시 (렌더 전용)
  private bubbleMs = 0; // 다음 말풍선까지 남은 ms
  private bubble?: Phaser.GameObjects.Container;
  /** 주인공 머리 위 닉네임 (플레이 중 표시) */
  private playerNickLabel!: Phaser.GameObjects.Text;
  /** 1000m 마일스톤 캐릭터+말풍선 연출 컨테이너 (에셋 준비 전엔 말풍선만) */
  private milestoneToast?: Phaser.GameObjects.Container;
  // 네온 트레일 — 바이크 뒤 수평 속도선 (렌더 전용)
  private trailGfx!: Phaser.GameObjects.Graphics;
  // 코드 드로우 장애물(화염분수·오염수) 전용 Graphics
  private codeObsGfx!: Phaser.GameObjects.Graphics;
  // 바이크 네온 글로우 FX (WebGL postFX — 비지원 기기에서는 null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private playerGlow: any = null;

  private hpFill!: Phaser.GameObjects.Image;
  private hpTrack!: Phaser.GameObjects.Image;  // 빈(소진) 구간 어두운 배경 트랙
  private hpGlow!: Phaser.GameObjects.Image;   // 우측 끝 소프트 글로우
  private hpFrame!: Phaser.GameObjects.Image;  // 하트 포함 프레임 (게임오버 시 숨김)
  private hpFillFullScale = 0;                 // ratio=1 일 때 scaleX (= HP_FILL_W / 텍스처폭)
  /** HP바 좌상단 — 포션 "HP+" 토스트 앵커 */
  private hpBarLeftX = 0;
  private hpBarTopY = 0;
  // #11 가로형 랭킹 패널 — 상단, 3위 고스트(최종거리 고정) + 플레이어(실시간)
  // panel[0]=플레이어, panel[1]=G1, panel[2]=G2, panel[3]=G3 (컨테이너)
  private rankPanels: Phaser.GameObjects.Container[] = [];
  private rankPanelBgs: Phaser.GameObjects.Image[] = [];
  private rankPanelTexts: Phaser.GameObjects.Text[] = [];
  private top3GhostDists: number[] = []; // startRun()에서 캐시, 판 내내 고정
  private top3GhostNames: string[] = []; // top3GhostDists와 정렬 순서 동일 (순위 칩 닉네임)
  private gameOverDistText!: Phaser.GameObjects.Text; // 이번 판 거리 (중앙 상단 칩)
  private gameOverDistChipBg!: Phaser.GameObjects.Graphics; // 거리 칩 검정 캡슐
  private hintText!: Phaser.GameObjects.Text; // "ONE MORE RUN?" (Replay 아래)
  // ── 결과 UI = 일간 | Replay | 주간 3분할 ──
  private gameOverRoot!: Phaser.GameObjects.Container;
  private dailyPanel!: Phaser.GameObjects.Container;
  private weeklyPanel!: Phaser.GameObjects.Container;
  private replayBtn!: Phaser.GameObjects.Container;
  /** Replay 라벨 — 게임오버 시 천천히 점멸 */
  private replayLabel!: Phaser.GameObjects.Text;
  private replayBg!: Phaser.GameObjects.Image;
  private dailyRowTexts: Phaser.GameObjects.Text[] = [];
  private dailyRowDists: Phaser.GameObjects.Text[] = [];
  private dailyMyText!: Phaser.GameObjects.Text;
  private dailyMyDist!: Phaser.GameObjects.Text;
  private weeklyRowTexts: Phaser.GameObjects.Text[] = []; // 1~4등 이름(좌)
  private weeklyRowDists: Phaser.GameObjects.Text[] = []; // 1~4등 거리(우측정렬)
  private weeklyMyText!: Phaser.GameObjects.Text; // 5번째 칸 이름(좌)
  private weeklyMyDist!: Phaser.GameObjects.Text; // 5번째 칸 거리(우측정렬)
  private weeklyRanks: WeeklyRank[] | null = null; // 게임오버 시 fetch 결과 (null = 아직/실패)
  private lastResultMyDist = 0; // showResultPanel 시점 거리 — 일간 패널 갱신용
  /** Replay 탭 → startRun 직후 같은 pointerdown이 window onTap으로 점프 먹는 것 방지 */
  private ignoreNextWindowTap = false;
  /** 결과 패널 닉 표시 최대 폭(px) — 거리 열과 겹치지 않게 create에서 설정 */
  private rankNameMaxPx = 64;

  constructor() {
    super({ key: "GameScene" });
  }

  preload() {
    // 전처리된 게임 텍스처 로드 (Vite 해시 URL). 결정론과 무관한 렌더 자원.
    // player-ride: 6프레임 스프라이트시트(전처리본 2082×300 → 각 347×300). 배경 투명·하단 정렬 완료.
    this.load.spritesheet("player-ride", playerRideUrl, {
      frameWidth: 347,
      frameHeight: 300,
    });
    this.load.image("player-jump1", playerJump1Url);
    this.load.image("player-jump2", playerJump2Url);
    this.load.image("player-hit", playerHitUrl);
    this.load.image("player-dead", playerDeadUrl);
    // ghost-run: 6프레임 스프라이트시트(전처리본 1434×300 → 각 239×300). 배경 투명·정렬 완료.
    this.load.spritesheet("ghost-run", ghostRunSheetUrl, {
      frameWidth: 239,
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
    this.load.image("obs-barricade", obsBarricadeUrl);
    this.load.image("obs-vending", obsVendingUrl);
    this.load.image("obs-fissure", obsFissureUrl);
    this.load.image("hp-frame", hpFrameUrl);
    // flame-pilar-1/2 이미지 사용 안 함 — 코드 드로우 화염분수로 교체
    // bg-sun: 코드 태양으로 대체, 이미지 로드 불필요
    // fx-meteor-*: 코드 드로우(drawCodeMeteor)로 대체, 이미지 로드 불필요
    this.load.image("sign-yakou", signYakouUrl);
    this.load.image("sign-hotel", signHotelUrl);
    this.load.image("sign-music", signMusicUrl);
    this.load.image("sign-shinya", signShinyaUrl);
    // 원경 배경 3종
    this.load.image("bg-buildings-far", bgBuildingsFarUrl);
    this.load.image("bg-bridges-far", bgBridgesFarUrl);
    this.load.image("bg-bridges-curved-far", bgBridgesCurvedFarUrl);
    // UI 패널 (9-slice) + 게임오버 Replay CTA
    this.load.image("panel-rank-hud", panelRankHudUrl);
    this.load.image("panel-rank-hud-gold", panelRankHudGoldUrl);
    this.load.image("panel-daily", panelDailyUrl);
    this.load.image("panel-weekly", panelWeeklyUrl);
    this.load.image("panel-gameover", panelGameoverUrl);
    this.load.image("panel-tutorial", panelTutorialUrl);
    this.load.image("btn-replay", btnReplayUrl);
    this.load.image("intro-slide", introSlideUrl);
  }

  create() {
    // 레티나 렌더링: 백킹 캔버스는 논리 크기 × RENDER_DPR (main.ts) — 카메라 줌으로
    // 논리 좌표계(1040×480)를 복원한다. 모든 씬 코드는 논리 좌표 그대로 사용.
    this.cameras.main.setZoom(RENDER_DPR).centerOn(DESIGN_W / 2, DESIGN_H / 2);

    this.startRun();

    // 배경 레이어 (하늘·노을 선·패럴랙스 스카이라인·바닥 그리드).
    // 가장 먼저 add → 디스플레이 리스트 최하단 = 모든 게임 오브젝트 뒤에 렌더.
    this.createBackground();

    // 정전 트랩 오버레이 — 월드(depth 0) 위, HUD 텍스트(10+)·순위 칩(22) 아래.
    this.blackoutGfx = this.add.graphics().setDepth(6);
    // WARNING / FEVER — 코드 드로우 스파이크 뱃지 (에셋과 동일: 캡슐+6스파이크).
    // 우측 하단. FEVER는 WARNING과 같은 슬롯(피버 중엔 연막 스킵이라 충돌 없음).
    this.warnBadge = this.makeSpikeBadge("WARNING", {
      neon: 0xff5fa2,
      fill: 0x140018,
      text: 0xff7ab8,
      w: 280,
      h: 72,
    });
    // 우측 여백은 유지하되, 이전(-96)보다 오른쪽으로
    this.warnBadge.setPosition(DESIGN_W - 52, DESIGN_H - 64).setVisible(false);
    this.feverBadge = this.makeSpikeBadge("FEVER!", {
      neon: 0xffd400,
      fill: 0x1a1400,
      text: 0xffe566,
      w: 240,
      h: 72,
    });
    this.feverBadge.setPosition(DESIGN_W - 52, DESIGN_H - 64).setVisible(false);

    // 메테오 풀은 createBackground() 안에서 태양보다 먼저 생성됨 (Z-order 보장).
    this.meteorSpawnMs = 0; // 게임 시작 즉시 첫 스폰

    // laserGraphics는 createBackground() 안에서 태양보다 먼저 생성됨 (Z-order 보장)

    // 텍스처에 LINEAR 필터 명시 — 전역 antialias:true 와 belt-and-suspenders.
    // zoom(DPR) 확대 환경에서 NEAREST 필터는 도트 계단이 생기므로 명시적으로 LINEAR.
    [
      "ghost-run",
      "ghost-collapse",
      "player-ride",
      "player-jump1",
      "player-jump2",
      "player-hit",
      "player-dead",
      // 배경·패널도 LINEAR — 안 그러면 2048→1040 축소/패널 축소 시 도트 계단(자글자글).
      "bg-buildings-far",
      "bg-bridges-far",
      "bg-bridges-curved-far",
      "panel-daily",
      "panel-weekly",
      "panel-tutorial",
      "panel-gameover",
      "panel-rank-hud",
      "panel-rank-hud-gold",
      "btn-replay",
      "hp-frame",
      "intro-slide",
    ].forEach((key) => {
      const tex = this.textures.get(key);
      if (tex) tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    });

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
    // player-ride 달리기 애니 — 6프레임 루프, 고스트와 같은 속도(12fps=0.5s/cycle).
    if (!this.anims.exists("player-ride-anim")) {
      this.anims.create({
        key: "player-ride-anim",
        frames: this.anims.generateFrameNumbers("player-ride", {
          start: 0,
          end: 5,
        }),
        frameRate: GHOST_RUN_FPS,
        repeat: -1,
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

    // 네온 트레일 — 플레이어보다 먼저 add → 플레이어 스프라이트 뒤에서 그려짐.
    this.trailGfx = this.add.graphics();

    // 고스트 순위 라벨 (#1 #2 #3) — 고스트 스프라이트보다 나중에 add → depth가 위에 올라옴.
    // 1위=골드, 2·3위=연한 시안/화이트.
    // 무채색 계조 — 1등=밝은 회백, 3등으로 갈수록 어둡게. 눈에 덜 띄게.
    const RANK_COLORS = ["#ffe9a8", "#e8e8e8", "#c8c8c8"] as const;
    const RANK_TEXT = ["1st", "2nd", "3rd"] as const;
    for (let i = 0; i < 3; i++) {
      const lbl = this.add
        .text(0, 0, RANK_TEXT[i]!, {
          // 12px — 머리 위 과점유 완화(16→14→12).
          fontSize: "12px",
          fontFamily: FONT_HUD,
          fontStyle: "bold",
          color: RANK_COLORS[i],
          resolution: TXT_RES,
          stroke: "#0a0018",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setAlpha(0.95)
        .setVisible(false);
      this.ghostRankLabels.push(lbl);
    }

    // 플레이어: 네온 바이커 소녀. 아트는 히트박스보다 넓다(overhang).
    this.playerRect = this.add
      .sprite(toScreenX(C.PLAYER_X), GROUND_Y_PX, "player-ride")
      .setOrigin(PLAYER_ART_ORIGIN_X, PLAYER_ART_ORIGIN_Y);
    this.playerRect.setDisplaySize(
      (this.playerRect.width / this.playerRect.height) * PLAYER_ART_H,
      PLAYER_ART_H,
    );
    this.playerRect.play("player-ride-anim");
    // 주인공 머리 위 닉네임 — 고스트 등수 라벨과 대칭. syncVisuals에서 위치 추적.
    this.playerNickLabel = this.add
      .text(0, 0, this.clipNickChars(getNickname(window.localStorage), 10), {
        fontSize: "13px",
        fontFamily: FONT_KR,
        fontStyle: "bold",
        color: "#ffd700",
        resolution: TXT_RES,
        stroke: "#0a0018",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.95)
      .setDepth(8)
      .setVisible(false);
    // 바이크 시안 네온 글로우 — WebGL postFX, 비지원 기기는 무시 (렌더 전용, 결정론 무관)
    try {
      if (this.playerRect.postFX) {
        // 글로우 강도·반경을 낮춤 — postFX는 저사양에서 프레임 드롭의 주원인
        this.playerGlow = this.playerRect.postFX.addGlow(
          0x5efce8,
          1.5,
          0,
          false,
          0.1,
          // 글로우 반경은 백킹 픽셀 단위 — 레티나 백킹(×RENDER_DPR)에서 같은
          // 시각 크기를 유지하려면 배율 보정 필요
          6 * RENDER_DPR,
        );
      }
    } catch {
      /* postFX 비지원 환경 — 무시 */
    }

    // 장애물 연기 레이어 — 장애물 풀보다 먼저 add → 장애물 스프라이트 뒤에서 피어오름.
    this.smokeGfx = this.add.graphics();
    // 코드 드로우 장애물(화염분수·오염수) — smoke 뒤, image 장애물 앞
    this.codeObsGfx = this.add.graphics();

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

    // infiniteJumpText: 제거됨 — "클릭시 무한 회복!" 문구 불필요
    this.infiniteJumpText = this.add.text(0, 0, "").setVisible(false);

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
    // ── HP바: 종횡비 보존 프레임(hp-frame 780×104 고해상) + 그라데이션 fill ──
    // 구조: fill Image(depth 20, 무채색 세로 그라데이션 → setTint 로 색 입힘)
    //       + hp-frame Image(depth 21, 내부 투명 → fill 비침, 우측 하트 아이콘 보존)
    // ★ 이전 버그: 260×20 강제 리사이즈로 비율 깨짐+저해상, fillGradientStyle→generateTexture
    //   가 투명 텍스처가 돼 "점만" 보임. → 고해상 프레임 + Canvas 그라데이션으로 교체.
    // 프레임 종횡비(hp-frame.png = 780×126 ≈ 6.19:1, 글로우 보존 prep)에 맞춰 barH 산출 → 왜곡 없음.
    const barW = 260;
    const barH = Math.round(barW * (126 / 780)); // ≈ 42
    const barY = DESIGN_H - 24;
    // 내부(투명 구멍) pad 측정값(780×126): 게이지 캐비티 ≈0.04~0.88 / 하트 구획 ≈0.90+.
    // fill은 하트 직전(구획선)까지만 — 하트 안은 비우고 아이콘만 보이게.
    // fill(depth 20) 위에 하트 포함 프레임(depth 21)이 겹쳐 자연스럽게 가려진다.
    // fill 시작을 마스크 좌측과 일치 → 좌측에 track(검정)이 새는 빈틈 없음.
    // 좌측 라운드 곡면까지 fill이 차게 — 0.04면 마스크가 직선으로 잘려 검정 틈이 남음.
    // 프레임(depth 21)이 시안 림을 덮으므로 fill이 림 밑으로 살짝 들어가도 안전.
    const HP_L_FRAC = 0.01;
    // 하트 구획(~0.90) 직전 — 만땅도 하트 밑까지 안 침범
    const HP_R_FRAC = 0.88;
    const HP_FILL_W = Math.round((HP_R_FRAC - HP_L_FRAC) * barW);
    const fillX = DESIGN_W / 2 - barW / 2 + Math.round(HP_L_FRAC * barW);
    // ★ 이전엔 16px 폭 텍스처를 ~14배 X-스트레치 → 늘어나며 대각선 밴딩 + 하단이 너무
    //   어두워 초록이 "듬성듬성"하게 보였다. 텍스처 폭을 채움 폭과 동일(고DPR 반영)하게
    //   만들어 X 스트레치를 없애고, 하단을 밝게 유지해 솔리드한 광택으로 정리한다.
    const HP_TEX_W = Math.max(64, Math.round(HP_FILL_W * RENDER_DPR));
    // ★ 프레임 캐비티를 거의 full 높이로 채움. 마스크가 낮으면(0.78) 위·아래 어두운 띠가
    //   남아 게이지가 "듬성듬성/속이 빔"으로 읽힌다. 넘침은 네온 테두리가 가림.
    const fillTexH = Math.max(6, Math.round(barH * 1.08 * RENDER_DPR));

    // ── 무채색 세로 광택 그라데이션 fill 텍스처 (Canvas 로 생성 — 안정적) ──
    // 원리: 흰(상단)→밝은 회(하단) 무채색을 setTint로 물들이면 어느 색이든 솔리드한 광택 유지.
    //   (Graphics.fillGradientStyle→generateTexture 는 일부 환경에서 투명 텍스처가 되는
    //   버그가 있어 Canvas 2D 그라데이션으로 대체.)
    // 키 버전업: 마스크/높이/좌측 인셋 변경 시 HMR 캐시 무효화.
    if (!this.textures.exists("hp-fill-grad7")) {
      const ct = this.textures.createCanvas("hp-fill-grad7", HP_TEX_W, fillTexH);
      if (ct) {
        const ctx = ct.getContext();
        const grad = ctx.createLinearGradient(0, 0, 0, fillTexH);
        grad.addColorStop(0.0, "#ffffff");
        grad.addColorStop(0.5, "#eaeaea");
        grad.addColorStop(1.0, "#c4c4c4"); // 하단도 밝게 → 초록이 죽지 않음
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, HP_TEX_W, fillTexH);
        // 상단 소프트 스펙큘러(전체 높이의 12%) — 얇은 1px 줄무늬 대신 부드러운 광택
        const spec = ctx.createLinearGradient(0, 0, 0, Math.max(2, fillTexH * 0.12));
        spec.addColorStop(0, "rgba(255,255,255,0.9)");
        spec.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = spec;
        ctx.fillRect(0, 0, HP_TEX_W, Math.max(2, fillTexH * 0.12));
        ct.refresh();
      }
    }

    // ── 우측 끝 소프트 글로우 텍스처 (방사형) ──
    if (!this.textures.exists("hp-end-glow")) {
      const gfx = this.add.graphics();
      const glowR = 7;
      for (let r = glowR; r >= 1; r--) {
        gfx.fillStyle(0xffffff, ((glowR - r + 1) / glowR) * 0.5);
        gfx.fillCircle(glowR, glowR, r);
      }
      gfx.generateTexture("hp-end-glow", glowR * 2, glowR * 2);
      gfx.destroy();
    }

    this.hpFillFullScale = HP_FILL_W / HP_TEX_W; // ratio=1 일 때 scaleX (= 1/DPR)

    // 빈(소진) 구간용 어두운 트랙 — 항상 풀 폭. 없으면 소진 구간에 게임 배경이 투명하게
    // 비쳐 "뚫린 구멍"처럼 보였다. fill(depth20) 밑(depth19)에 깔아 빈 게이지처럼 읽히게 한다.
    this.hpTrack = this.add
      .image(fillX, barY, "hp-fill-grad7")
      .setOrigin(0, 0.5)
      .setDepth(19)
      .setTint(0x0b1f1a)
      .setAlpha(0.92);
    this.hpTrack.scaleX = this.hpFillFullScale;
    this.hpTrack.scaleY = this.hpFillFullScale;

    this.hpFill = this.add
      .image(fillX, barY, "hp-fill-grad7")
      .setOrigin(0, 0.5)
      .setDepth(20)
      .setTint(0x3ef0c0); // 네온 민트 — syncVisuals 전(타이틀)에 흰색으로 보이지 않게
    this.hpFill.scaleX = this.hpFillFullScale; // 초기: 풀 HP
    // 텍스처를 DPR배 고해상으로 만들었으므로 Y도 1/DPR로 되돌려 표시 높이를 맞춘다.
    this.hpFill.scaleY = this.hpFillFullScale;

    this.hpGlow = this.add
      .image(fillX + HP_FILL_W, barY, "hp-end-glow")
      .setOrigin(0.5, 0.5)
      .setDepth(20)
      .setAlpha(0.35); // 하트 근처 밝은 얼룩 완화

    // 프레임: 종횡비 그대로 스케일(왜곡 없음). 내부 투명 → fill 비침, 하트는 우측에 보존.
    // 하트 안 회색 fill은 제거 — 게이지는 하트 직전(HP_R_FRAC)까지만 채움.
    this.hpFrame = this.add
      .image(DESIGN_W / 2, barY, "hp-frame")
      .setDisplaySize(barW, barH)
      .setDepth(21);
    // 포션 "HP+" 토스트 앵커 — 체력바 좌상단
    this.hpBarLeftX = DESIGN_W / 2 - barW / 2;
    this.hpBarTopY = barY - barH / 2;

    // ★ fill/track을 '깔끔한 라운드 사각형' geometry 마스크로 클립.
    //   마스크 세로를 barH×0.92로 키워 캐비티를 거의 채움(0.78이면 위·아래 어두운 띠 → 듬성듬성).
    //   가로도 테두리 안쪽까지. 넘침은 네온 프레임(depth 21)이 가림.
    {
      const mLeft = DESIGN_W / 2 - barW / 2 + barW * HP_L_FRAC;
      const mRight = DESIGN_W / 2 - barW / 2 + barW * HP_R_FRAC;
      const mW = mRight - mLeft;
      const mH = Math.round(barH * 0.92);
      const maskG = this.add.graphics().setVisible(false);
      maskG.fillStyle(0xffffff, 1);
      maskG.fillRoundedRect(mLeft, barY - mH / 2, mW, mH, Math.round(mH * 0.35));
      const hpMask = maskG.createGeometryMask();
      this.hpFill.setMask(hpMask);
      this.hpTrack.setMask(hpMask);
    }

    // ── paceText/overtakeHudText: 랭킹 패널로 대체 → 투명으로 유지 ──
    this.paceText = this.add
      .text(-9999, -9999, "", { fontSize: "14px", color: "#ffffff" })
      .setVisible(false);
    this.overtakeHudText = this.add
      .text(-9999, -9999, "", { fontSize: "15px", color: "#b39ddb" })
      .setVisible(false);

    // ── 랭킹 패널: 상단 가로형 4칸 (슬롯 0=1등 ~ 3=4등), 초기 x=-9999(오프스크린) ──
    // panel[0]=플레이어(골드), panel[1..3]=상위 3고스트(시안). 순위 변경 시 tween으로 좌우 이동.
    // ★ nineslice는 큰 프레임(952×183)을 218×42로 뭉개 톱니처럼 깨졌다. 칩 크기가 항상 고정이므로
    //   nineslice가 불필요 — 표시비율(218/42≈5.19)이 원본(952/183≈5.20)과 거의 같아 그냥 축소 Image면
    //   왜곡 0. 텍스트는 칩 중앙정렬해 프레임 밖으로 안 넘치게 한다.
    const RP_H = 42,
      RP_W = 218;
    const rpLabels = ["YOU", "G1", "G2", "G3"];
    const rpIsPlayer = [true, false, false, false];
    for (let i = 0; i < 4; i++) {
      const isMe = rpIsPlayer[i]!;
      const bgKey = isMe ? "panel-rank-hud-gold" : "panel-rank-hud";
      // 검정 매트 — 래스터 외곽 fringe가 배경에 번지지 않게 먼저 가림.
      const matte = this.add.graphics();
      matte.fillStyle(0x060010, 0.94);
      matte.fillRoundedRect(0, 0, RP_W, RP_H, 11);
      // 래스터는 1.5px inset — 축소 시 톱니·흰 할로가 생기는 최외곽을 잘라냄.
      const inset = 1.5;
      const bg = this.add
        .image(inset, inset, bgKey)
        .setOrigin(0, 0)
        .setDisplaySize(RP_W - inset * 2, RP_H - inset * 2)
        // 시안 칩은 알파를 낮춰 화면 전체와 조화(번쩍임 완화). YOU만 조금 더 또렷.
        .setAlpha(isMe ? 0.88 : 0.62);
      // 벡터 림 — 알파를 올려 축소 시 자글거림(저알파 AA)을 줄임. YOU는 더 또렷.
      const rimColor = isMe ? 0xffd35c : 0x36f9f6;
      const rimHi = isMe ? 0xffe9a8 : 0x9afcff;
      const rim = this.add.graphics();
      rim.lineStyle(2.6, rimColor, isMe ? 0.85 : 0.72);
      rim.strokeRoundedRect(0.5, 0.5, RP_W - 1, RP_H - 1, 11);
      rim.lineStyle(1.2, rimHi, isMe ? 0.55 : 0.42);
      rim.strokeRoundedRect(2, 2, RP_W - 4, RP_H - 4, 9);
      // y: 칩 세로 중앙 — 이전 +2는 너무 아래라 0으로 복귀(아주 살짝만 위)
      const txt = this.add
        .text(RP_W / 2, RP_H / 2, rpLabels[i]!, {
          fontSize: isMe ? "15px" : "13px",
          color: isMe ? "#ffd700" : "#00e5ff",
          fontFamily: FONT_HUD,
          fontStyle: "bold",
          resolution: TXT_RES,
          align: "center",
        })
        .setOrigin(0.5, 0.5);
      // y=28: 「실시간」 라벨(y≈10) 아래 + 상단 여백(이전 y=20은 화면 상단에 너무 붙음)
      const container = this.add
        .container(-9999, 28, [matte, bg, rim, txt])
        .setDepth(22)
        .setVisible(false);
      this.rankPanels.push(container);
      this.rankPanelBgs.push(bg);
      this.rankPanelTexts.push(txt);
    }
    // 「👑 TODAY」 — 칩 열 왼쪽 위. x는 updateRankPanel에서 칩 startX에 맞춤.
    this.rankHudLabel = this.add
      .text(0, 10, "👑 TODAY", {
        fontSize: "11px",
        fontFamily: FONT_KR,
        color: "#36f9f6",
        resolution: TXT_RES,
      })
      .setOrigin(0, 0)
      .setAlpha(0.85)
      .setStroke("#0a0018", 3)
      .setDepth(22)
      .setVisible(false);

    // 좌측 끝 콤보 띠지 — 랭킹 칩 아래(y 유지), x는 항상 화면 왼쪽. 좌→우 슬라이드 인.
    {
      const ribbonW = 118;
      const ribbonH = 26;
      const restX = 0; // 화면 왼쪽 끝 밀착 (여백 없음)
      // 칩(y=28,h=42) 아래 여백을 더 줘서 랭킹과 간격 확보
      const restY = 28 + 42 + 18 + ribbonH / 2;
      this.comboRibbonBg = this.add
        .rectangle(0, 0, ribbonW, ribbonH, 0x060010, 0.88)
        .setOrigin(0, 0.5);
      this.comboDisplay = this.add
        .text(ribbonW / 2, 0, "", {
          fontSize: "14px",
          fontFamily: FONT_HUD,
          fontStyle: "bold",
          color: "#ffd166",
          resolution: TXT_RES,
        })
        .setOrigin(0.5, 0.5)
        .setStroke("#1a1a2e", 3);
      this.comboRibbon = this.add
        .container(-ribbonW - 8, restY, [this.comboRibbonBg, this.comboDisplay])
        .setDepth(23)
        .setVisible(false);
      this.comboRibbon.setData("restX", restX);
      this.comboRibbon.setData("hiddenX", -ribbonW - 8);
    }

    // ── 결과 UI = 일간 | Replay | 주간 3분할 ──
    // 좌/우는 같은 세로 패널 프레임(panel-daily / panel-weekly). 가운데만 Replay CTA.
    // 전체 화면 탭 재시작은 제거 — Replay 히트영역만 startRun(true).
    {
      const rankSrc = this.textures.get("panel-daily").getSourceImage();
      const btnSrc = this.textures.get("btn-replay").getSourceImage();
      // 화면 폭 1040 — 좌·우 패널 + 중앙 버튼 + 여백이 한 줄에 들어가게 스케일.
      const PH = 400;
      const PW = Math.round((PH * rankSrc.width) / rankSrc.height); // ≈210
      const BH = 220;
      const BW = Math.round((BH * btnSrc.width) / btnSrc.height); // ≈82
      const gap = 18;
      const colL = -(PW / 2 + gap / 2 + BW / 2);
      const colR = PW / 2 + gap / 2 + BW / 2;
      // 아트 구획 y (텍스처 세로 fraction, 실측) → 컨테이너 로컬 좌표
      const fy = (f: number, h: number) => (f - 0.5) * h;
      // 오렌지 헤더 아래 5행 슬롯 — divider 실측 fraction을 살짝 내려 슬롯 세로 중앙에 맞춤.
      // (균일 pad로 밀면 하단 행이 슬롯 밖으로 이탈하는 회귀가 났음)
      const rowFy = [0.322, 0.438, 0.562, 0.682, 0.825] as const;
      const rowYPad = 0;
      // 네온 림·노치 안쪽까지 글자가 붙지 않게 좌우 인셋 (기존 0.12/0.10 → 살짝 여유)
      const xL = -PW / 2 + Math.round(PW * 0.17);
      const xR = PW / 2 - Math.round(PW * 0.15);
      // 거리 열(~"47,314m" ≈ 58px) + 간격 — 닉이 거리 위로 겹치지 않게
      this.rankNameMaxPx = Math.max(48, xR - xL - 62);

      const buildRankPanel = (
        texKey: string,
        title: string,
        titleColor: string,
      ): {
        container: Phaser.GameObjects.Container;
        rowNames: Phaser.GameObjects.Text[];
        rowDists: Phaser.GameObjects.Text[];
        myName: Phaser.GameObjects.Text;
        myDist: Phaser.GameObjects.Text;
      } => {
        // 패널 뒤 얇은 검정 매트 — 글로우 fringe만 가리고 프레임처럼 두껍게 보이지 않게.
        const mattePad = 5;
        const matteR = 20;
        const matte = this.add.graphics();
        matte.fillStyle(0x000000, 0.88);
        matte.fillRoundedRect(
          -PW / 2 - mattePad,
          -PH / 2 - mattePad,
          PW + mattePad * 2,
          PH + mattePad * 2,
          matteR,
        );
        matte.lineStyle(3, 0x000000, 1);
        matte.strokeRoundedRect(
          -PW / 2 - mattePad,
          -PH / 2 - mattePad,
          PW + mattePad * 2,
          PH + mattePad * 2,
          matteR,
        );
        // 시안 soft stroke — 알파를 올려 축소 시 자글거림 완화.
        const rim = this.add.graphics();
        rim.lineStyle(2.2, 0x36f9f6, 0.62);
        rim.strokeRoundedRect(
          -PW / 2 + 3,
          -PH / 2 + 3,
          PW - 6,
          PH - 6,
          Math.max(12, matteR - 6),
        );
        rim.lineStyle(1.2, 0x9afcff, 0.38);
        rim.strokeRoundedRect(
          -PW / 2 + 5,
          -PH / 2 + 5,
          PW - 10,
          PH - 10,
          Math.max(10, matteR - 8),
        );
        const bg = this.add.image(0, 0, texKey).setDisplaySize(PW, PH);
        // 오렌지 헤더 박스 안 — 살짝 아래로 (0.185는 박스 상단에 붙음)
        const titleText = this.add
          .text(0, fy(0.198, PH), title, {
            fontSize: "13px",
            color: titleColor,
            fontStyle: "bold",
            resolution: TXT_RES,
          })
          .setOrigin(0.5);
        const children: Phaser.GameObjects.GameObject[] = [
          matte,
          bg,
          rim,
          titleText,
        ];
        const rowNames: Phaser.GameObjects.Text[] = [];
        const rowDists: Phaser.GameObjects.Text[] = [];
        for (let i = 0; i < 4; i++) {
          const name = this.add
            .text(xL, fy(rowFy[i]!, PH) + rowYPad, "", {
              fontSize: "11px",
              color: "#e0e0e0",
              resolution: TXT_RES,
            })
            .setOrigin(0, 0.5);
          const dist = this.add
            .text(xR, fy(rowFy[i]!, PH) + rowYPad, "", {
              fontSize: "11px",
              color: "#e0e0e0",
              resolution: TXT_RES,
            })
            .setOrigin(1, 0.5);
          rowNames.push(name);
          rowDists.push(dist);
          children.push(name, dist);
        }
        const myName = this.add
          .text(xL, fy(rowFy[4]!, PH) + rowYPad, "", {
            fontSize: "11px",
            color: "#ffd700",
            fontStyle: "bold",
            resolution: TXT_RES,
          })
          .setOrigin(0, 0.5);
        const myDist = this.add
          .text(xR, fy(rowFy[4]!, PH) + rowYPad, "", {
            fontSize: "11px",
            color: "#ffd700",
            fontStyle: "bold",
            resolution: TXT_RES,
          })
          .setOrigin(1, 0.5);
        children.push(myName, myDist);
        return {
          container: this.add.container(0, 0, children),
          rowNames,
          rowDists,
          myName,
          myDist,
        };
      };

      const daily = buildRankPanel(
        "panel-daily",
        "일간 랭킹 · 오늘",
        "#ffb347",
      );
      daily.container.x = colL;
      this.dailyPanel = daily.container;
      this.dailyRowTexts = daily.rowNames;
      this.dailyRowDists = daily.rowDists;
      this.dailyMyText = daily.myName;
      this.dailyMyDist = daily.myDist;

      const weekly = buildRankPanel(
        "panel-weekly",
        "주간 랭킹 · 7일",
        "#ffb347",
      );
      weekly.container.x = colR;
      this.weeklyPanel = weekly.container;
      this.weeklyRowTexts = weekly.rowNames;
      this.weeklyRowDists = weekly.rowDists;
      this.weeklyMyText = weekly.myName;
      this.weeklyMyDist = weekly.myDist;

      // 가운데 Replay — 에셋 프레임 + 세로 스택 글자. 탭 히트만 재시작.
      this.replayBg = this.add.image(0, 0, "btn-replay").setDisplaySize(BW, BH);
      // 거리 칩: Replay 위 · 좌우 패널 상단(y=-PH/2)과 정렬. 검정 캡슐로 태양 대비 확보.
      this.gameOverDistChipBg = this.add.graphics();
      this.gameOverDistText = this.add
        .text(0, 0, "", {
          fontSize: "15px",
          color: "#ffffff",
          fontFamily: FONT_HUD,
          resolution: TXT_RES,
        })
        .setOrigin(0.5)
        .setStroke("#000000", 3);
      const distChip = this.add.container(0, -PH / 2, [
        this.gameOverDistChipBg,
        this.gameOverDistText,
      ]);
      // 세로로 긴 버튼이라 가로 REPLAY는 답답함 → 글자 스택(위에서 아래로 읽기)
      this.replayLabel = this.add
        .text(0, -4, "R\nE\nP\nL\nA\nY", {
          fontSize: "16px",
          color: "#36f9f6",
          fontStyle: "bold",
          fontFamily: FONT_HUD,
          align: "center",
          lineSpacing: 4,
          resolution: TXT_RES,
        })
        .setOrigin(0.5)
        .setStroke("#0a0018", 4);
      this.hintText = this.add
        .text(0, BH / 2 + 14, "", {
          fontSize: "10px",
          color: "#00e5ff",
          fontFamily: FONT_HUD,
          resolution: TXT_RES,
        })
        .setOrigin(0.5)
        .setAlpha(0.85);
      // 투명 히트영역 — 글로우 가장자리까지 탭 가능하게 버튼보다 살짝 크게
      const replayHit = this.add
        .rectangle(0, 0, BW + 16, BH + 16, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true });
      replayHit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        // window pointerdown(onTap)으로 버블되면 startRun 직후 점프로 먹히므로 차단.
        const ev = pointer.event as Event | undefined;
        ev?.stopPropagation?.();
        if (!this.gameOverRoot.visible) return;
        this.ignoreNextWindowTap = true;
        this.startRun(true);
      });
      this.replayBtn = this.add.container(0, 8, [
        this.replayBg,
        this.replayLabel,
        this.hintText,
        replayHit,
      ]);

      this.gameOverRoot = this.add
        .container(DESIGN_W / 2, DESIGN_H * 0.52, [
          this.dailyPanel,
          this.weeklyPanel,
          this.replayBtn,
          distChip,
        ])
        .setDepth(40)
        .setVisible(false);
    }

    // 일시정지 오버레이 — 중앙에 || 정지 아이콘만 (문구·우상단 안내 제거).
    const poBg = this.add.rectangle(
      DESIGN_W / 2,
      DESIGN_H / 2,
      DESIGN_W,
      DESIGN_H,
      0x000000,
      0.55,
    );
    // 반투명 흰 세로 막대 2개 = pause 아이콘 (가로바가 아니라 표준 ||)
    const poIcon = this.add.graphics();
    {
      const cx = DESIGN_W / 2;
      const cy = DESIGN_H / 2;
      const barW = 14;
      const barH = 56;
      const gap = 18;
      poIcon.fillStyle(0xffffff, 0.72);
      poIcon.fillRoundedRect(cx - gap / 2 - barW, cy - barH / 2, barW, barH, 4);
      poIcon.fillRoundedRect(cx + gap / 2, cy - barH / 2, barW, barH, 4);
    }
    this.pauseOverlay = this.add
      .container(0, 0, [poBg, poIcon])
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

    // ── 인트로 세로 슬라이드 (§6.3) — 매 판 표시. Start로만 종료 → 바로 플레이.
    {
      const src = this.textures.get("intro-slide").getSourceImage();
      const dispW = DESIGN_W;
      const dispH = Math.round((dispW * src.height) / src.width);
      // origin(0.5,1): 하단(땅)이 뷰포트 바닥에 맞춰 시작 → 위로 슬라이드하면 하늘이 드러남
      this.introImage = this.add
        .image(DESIGN_W / 2, DESIGN_H, "intro-slide")
        .setOrigin(0.5, 1)
        .setDisplaySize(dispW, dispH);
      const veil = this.add
        .rectangle(DESIGN_W / 2, DESIGN_H / 2, DESIGN_W, DESIGN_H, 0x000000, 0.22);
      // 카피 위치는 기존(≈38%) 유지 — Start는 카피 바로 아래
      const copyY = DESIGN_H * 0.38;
      const introNick = getNickname(window.localStorage);
      const copyStyle = {
        fontSize: "17px",
        fontFamily: FONT_KR,
        color: "#e8e0ff",
        align: "center" as const,
        lineSpacing: 6,
        resolution: TXT_RES,
      };
      const copyTop = this.add
        .text(
          0,
          0,
          "종말이 다가오자,\n수많은 이들이 그 비밀을 쫓다 쓰러졌다.",
          { ...copyStyle, wordWrap: { width: DESIGN_W - 80 } },
        )
        .setOrigin(0.5, 0)
        .setStroke("#0a0018", 5);
      // 닉네임만 노란 강조 — Phaser Text는 한 오브젝트 다색 미지원이라 조각 합성
      const nickPrefix = this.add
        .text(0, 0, "마지막 등불인 나[", copyStyle)
        .setOrigin(0, 0.5)
        .setStroke("#0a0018", 5);
      const nickHl = this.add
        .text(0, 0, introNick, {
          ...copyStyle,
          color: "#ffd700",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5)
        .setStroke("#0a0018", 5);
      const nickSuffix = this.add
        .text(0, 0, "]는", copyStyle)
        .setOrigin(0, 0.5)
        .setStroke("#0a0018", 5);
      const nickRowW =
        nickPrefix.width + nickHl.width + nickSuffix.width;
      nickPrefix.setX(-nickRowW / 2);
      nickHl.setX(nickPrefix.x + nickPrefix.width);
      nickSuffix.setX(nickHl.x + nickHl.width);
      const nickRow = this.add.container(0, copyTop.height + 18, [
        nickPrefix,
        nickHl,
        nickSuffix,
      ]);
      const copyBot = this.add
        .text(0, nickRow.y + 22, "그 흔적을 밟으며 다시 달리는데...", {
          ...copyStyle,
          wordWrap: { width: DESIGN_W - 80 },
        })
        .setOrigin(0.5, 0)
        .setStroke("#0a0018", 5);
      const copy = this.add.container(DESIGN_W / 2, copyY, [
        copyTop,
        nickRow,
        copyBot,
      ]);
      // 카피 바로 아래 중앙 Start — 가시성↑(2배) + 부드러운 점멸(CTA)
      this.introNextBtn = this.add
        .text(DESIGN_W / 2, copyY + 92, "Start →", {
          fontSize: "36px",
          fontFamily: FONT_HUD,
          fontStyle: "bold",
          color: "#5efce8",
          resolution: TXT_RES,
        })
        .setOrigin(0.5, 0)
        .setStroke("#0a0018", 6)
        .setPadding(24, 14, 24, 14)
        .setInteractive({ useHandCursor: true });
      this.introNextBtn.on(
        "pointerdown",
        (
          pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          // window pointerdown으로 버블되면 Start 직후 첫 탭이 점프로 먹히거나,
          // stopPropagation 시 ignore 플래그가 남아 다음 탭을 삼킨다 → DOM+Phaser 둘 다 차단.
          event.stopPropagation();
          pointer.event?.stopPropagation?.();
          pointer.event?.stopImmediatePropagation?.();
          this.endIntro(true);
        },
      );
      // 호버 알파 핸들러 없음 — 점멸 트윈과 충돌하므로 스케일만 살짝 키움
      this.introNextBtn.on("pointerover", () => this.introNextBtn.setScale(1.06));
      this.introNextBtn.on("pointerout", () => this.introNextBtn.setScale(1));
      this.introOverlay = this.add
        .container(0, 0, [this.introImage, veil, copy, this.introNextBtn])
        .setDepth(110)
        .setVisible(false);
      this.introOverlay.setData("dispH", dispH);
      // 시작: 뷰포트 바닥보다 더 아래(≈120px)에서 슬라이드 — 맨 아래에서 올라오는 연출 강화
      this.introOverlay.setData("startY", DESIGN_H + 120);
      // 끝: 이미지 상단이 뷰포트 상단에 오도록 (origin bottom → y = dispH)
      this.introOverlay.setData("endY", dispH);
      this.beginIntro();
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
      // panel-tutorial: prep 산출 실제 크기의 종횡비 그대로(늘림 0). 화면(480)에 맞춰 FH 고정.
      const ftSrc = this.textures.get("panel-tutorial").getSourceImage();
      const FH = 300;
      const FW = Math.round((FH * ftSrc.width) / ftSrc.height);
      const cx = DESIGN_W / 2, cy = DESIGN_H / 2;
      const ftBg = this.add.image(cx, cy, "panel-tutorial")
        .setDisplaySize(FW, FH);
      const ftTitle = this.add
        .text(cx, cy - FH / 2 + 70, "FEVER!", {
          fontSize: "24px",
          color: "#ffd700",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 5);
      const ftDesc = this.add
        .text(
          cx,
          cy - FH / 2 + 155,
          `콤보를 ${feverSec}초 이상 유지하면 발동!\n무한 점프 + 탭마다 체력 회복`,
          {
            fontSize: "17px",
            color: "#ffffff",
            align: "center",
            wordWrap: { width: FW - 32 },
          },
        )
        .setOrigin(0.5)
        .setStroke("#1a1a2e", 3);
      const ftSub = this.add
        .text(cx, cy + FH / 2 - 55, "탭하여 계속 →", {
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
    // 다시하기 버튼 — 일시정지 중에만 보임. startRun(true) 호출 + 오버레이 닫기.
    registerRestart(() => {
      this.pauseOverlay.setVisible(false);
      this.gamePaused = false;
      setRestartButtonVisible(false);
      this.startRun(true);
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

    // 모든 정적 텍스트에 고해상도 적용 — 컨테이너(랭킹/게임오버/일시정지/시작/피버) 내부까지
    // 재귀적으로 순회. 개별 .text() 호출마다 resolution을 지정하는 누락을 방지(작은 화면 자글거림).
    this.applyTextResolution(this.children.list);
  }

  /** 표시 리스트를 재귀 순회하며 모든 Text의 렌더 해상도를 TXT_RES로 올린다. */
  private applyTextResolution(objects: Phaser.GameObjects.GameObject[]): void {
    for (const obj of objects) {
      if (obj instanceof Phaser.GameObjects.Text) {
        obj.setResolution(TXT_RES);
      } else if (obj instanceof Phaser.GameObjects.Container) {
        this.applyTextResolution(obj.list);
      }
    }
  }

  /**
   * 원격(타 유저) + 로컬(봇/셀프) 기록을 합쳐 거리순 상위 N개를 고른다.
   * 봇은 로컬에 저장돼 있으므로(콜드스타트), 이 병합으로 봇과 유저가 거리순으로
   * 같은 필드에서 경쟁한다 → 봇 기록이 유저보다 높으면 자연히 상단 랭킹에 노출.
   * 봇 로그는 시드별 결정론이라 원격·로컬 양쪽에 같은 사본이 있을 수 있어 dedup.
   */
  private mergeGhostRecords(
    remote: GhostRecord[],
    local: GhostRecord[],
  ): GhostRecord[] {
    const seen = new Set<string>();
    const out: GhostRecord[] = [];
    for (const r of [...remote, ...local]) {
      const evs = r.log.events;
      // 결정론 봇/리플레이 dedup 키: 거리 + 입력 수 + 마지막 입력 프레임
      const key = `${Math.round(r.distance)}:${evs.length}:${evs[evs.length - 1]?.frame ?? -1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    out.sort((a, b) => b.distance - a.distance);
    return out.slice(0, GHOST_TOP_N);
  }

  /** 고스트 레코드 배열을 현재 세션 필드(ghosts/distances/top3)에 반영. */
  private applyGhostField(records: GhostRecord[]): void {
    this.ghosts = records.map((r) => new GhostDriver(r.log));
    this.ghostDistances = records.map((r) => r.distance);
    this.cacheTop3FromRecords(records);
    this.prevRank = this.ghosts.length + 1;
  }

  /**
   * 상단 실시간 칩용 top3 거리·닉 캐시.
   * records는 거리 내림차순이어야 한다(mergeGhostRecords 산출물).
   * 본인 과거 기록(같은 닉)은 칩에서 제외 — 안 그러면 "시안매-12"로 도배되고
   * 게임오버 패널(원격/봇 이름)과 어긋난다. 타인/봇이 없으면 폴백으로 전체 사용.
   */
  private cacheTop3FromRecords(records: GhostRecord[]): void {
    let myNick = "";
    try {
      myNick = getNickname(window.localStorage);
    } catch {
      /* ignore */
    }
    const others = myNick
      ? records.filter((r) => (r.log.meta?.nickname || "") !== myNick)
      : records;
    const pool = others.length > 0 ? others : records;
    const top3 = pool.slice(0, 3).map((r, i) => ({
      d: r.distance,
      nick:
        r.log.meta?.nickname ||
        deterministicNickname(Math.imul(i + 1, 0x9e3779b9)),
    }));
    this.top3GhostDists = top3.map((x) => x.d);
    this.top3GhostNames = top3.map((x) => x.nick);
  }

  /** 새 판 시작 — 데일리 시드(오늘의 코스) + 저장된 최고 기록 유령 로드.
   *  isRetry=true면 게임오버 후 자발적 재시작(첫 진입과 구분). */
  private startRun(isRetry = false) {
    // 이전 판의 결과 패널 딜레이 타이머가 남아있으면 즉시 취소.
    // 게임오버 후 900ms 이내에 재시작하면 새 판에서 패널이 튀어나오는 버그 방지.
    if (this.resultPanelTimer) {
      this.resultPanelTimer.remove(false);
      this.resultPanelTimer = null;
    }
    // 재시작 시 다시하기 버튼 반드시 숨김 (일시정지 해제 경로와 별도)
    setRestartButtonVisible(false);
    // 플레이어 사망 페이드 리셋 — 잔여 트윈 제거 + alpha/visible 모두 복원.
    // (사망 페이드 onComplete가 setVisible(false)를 남기므로 visible 복원 필수)
    this.playerDeadFadeStarted = false;
    if (this.playerRect) {
      this.tweens.killTweensOf(this.playerRect);
      this.playerRect.setAlpha(1).setVisible(true).setAngle(0);
    }
    this.seed = dailySeed(); // 같은 날 = 같은 코스 (TODOS 시드 공유 → 데일리 시드로 결정)
    this.sim = new GameSim(this.seed);
    this.log = createInputLog(this.seed);
    this.timestep = new FixedTimestep(C.DT * 1000);

    // 원격(타 유저) + 로컬(봇/셀프)을 병합해 거리순 상위 N → 봇이 유저보다 높으면 상단 노출.
    const localRecords = loadTopRuns(window.localStorage, this.seed);
    const merged = this.mergeGhostRecords(this.remoteRuns, localRecords);
    this.applyGhostField(merged);
    this.overtakenLive = 0;
    this.spectating = false;
    this.prevCombo = 0;
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
      // 로컬을 다시 읽어 봇 콜드스타트 직후 저장분도 포함
      const localNow = loadTopRuns(window.localStorage, currentSeed);
      const freshMerged = this.mergeGhostRecords(remote, localNow);
      if (this.seed !== currentSeed || this.sim.state.gameOver) return;

      // ★ 실시간 칩 닉/거리는 항상 원격+로컬 병합 결과로 갱신.
      //   예전엔 ghosts.length===0 일 때만 applyGhostField 해서, 로컬 셀프 고스트만
      //   있으면(전부 같은 내 닉) 칩이 "시안매-12"로 도배되고 게임오버 패널(원격/봇
      //   이름)과 어긋났다.
      this.cacheTop3FromRecords(freshMerged);

      // 고스트가 아직 없거나 초반이면 필드 자체도 원격 병합본으로 교체
      if (
        freshMerged.length > 0 &&
        (this.ghosts.length === 0 || this.sim.state.frame < C.SIM_FPS * 3)
      ) {
        this.applyGhostField(freshMerged);
      }
      // 병합 필드가 N보다 적으면 봇으로 보충
      if (freshMerged.length < GHOST_TOP_N) {
        void this.uploadBotColdStart(currentSeed, remote.length === 0);
      }
    });

    // 재시도 판에서는 피버 튜토리얼을 건너뜀 (이미 게임 흐름을 아는 상태)
    if (isRetry) this.needsFeverTutorial = false;

    this.gamePaused = false;
    // 코드 메테오 리셋 (재시작 시 이전 메테오 제거)
    this.codeMeteors = [];
    this.meteorSpawnMs = 0;
    // trailGfx는 drawNeonTrail에서 매 프레임 clear — 별도 리셋 불필요
    // 말풍선 리셋 — 시작 직후엔 안 뜨게 첫 발화를 4~7초 뒤로
    if (this.bubble) {
      this.bubble.destroy();
      this.bubble = undefined;
    }
    this.bubbleMs = 4000 + Math.random() * 3000;
    if (this.milestoneToast) {
      this.tweens.killTweensOf(this.milestoneToast);
      this.milestoneToast.destroy();
      this.milestoneToast = undefined;
    }
    if (this.replayLabel) {
      this.tweens.killTweensOf(this.replayLabel);
      this.replayLabel.setAlpha(1);
    }
    if (this.replayBg) {
      this.tweens.killTweensOf(this.replayBg);
      this.replayBg.setAlpha(1);
    }
    if (this.playerNickLabel) {
      this.playerNickLabel
        .setText(this.clipNickChars(getNickname(window.localStorage), 10))
        .setVisible(false);
    }

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
    // 순위 라벨 리셋 — 새 판 시작 시 숨김
    for (const lbl of this.ghostRankLabels) lbl.setVisible(false);
    if (this.gameOverRoot) this.gameOverRoot.setVisible(false);
    if (this.comboRibbon) {
      this.tweens.killTweensOf(this.comboRibbon);
      this.comboRibbon.setVisible(false);
      this.comboRibbon.x = this.comboRibbon.getData("hiddenX") ?? DESIGN_W + 8;
      this.comboRibbonVisible = false;
    }
    if (this.feverBadge) {
      this.tweens.killTweensOf(this.feverBadge);
      this.feverBadge.setVisible(false).setAlpha(1);
      this.feverBadgeVisible = false;
    }
    if (this.warnBadge) {
      this.tweens.killTweensOf(this.warnBadge);
      this.warnBadge.setVisible(false).setAlpha(1);
    }
    if (this.rankHudLabel) this.rankHudLabel.setVisible(false);
    // 바이옴/마일스톤 리셋 — 새 판은 항상 기본 노을 팔레트에서 시작
    this.biomeFrom = 0;
    this.biomeTo = 0;
    this.biomeMix = 1;
    this.lastKmMilestone = 0;
    if (this.skyGfx) this.drawSky(BIOMES[0]!);
    // 펀치 줌 중 재시작 대비 — 카메라를 기본 줌·중심으로 복원
    this.tweens.killTweensOf(this.zoomPunch);
    this.zoomPunch.t = 0;
    this.cameras.main.setZoom(RENDER_DPR).centerOn(DESIGN_W / 2, DESIGN_H / 2);
    // 정전 트랩 리셋 — 발동 수열을 시드에서 재파생 (같은 시드 = 같은 발동 지점)
    this.blackoutLcg = this.seed | 0;
    this.blackoutNextAtM = BLACKOUT_START_M + this.blackoutRoll(BLACKOUT_GAP_JITTER_M);
    this.blackoutPhase = "idle";
    if (this.blackoutGfx) this.blackoutGfx.clear();
    if (this.warnBadge) this.warnBadge.setVisible(false);
    if (this.feverOverlay) this.feverOverlay.setVisible(false);
    if (this.infiniteJumpText) this.infiniteJumpText.setVisible(false);
    if (this.spectateHintText) this.spectateHintText.setVisible(false);
    if (this.youDiedText) this.youDiedText.setVisible(false);
    if (this.pauseOverlay) this.pauseOverlay.setVisible(false);
    setPauseButtonState(false, true);
    // 매 판 인트로 표시 (재시도 포함). create() 초반엔 introOverlay가 아직 없을 수 있음.
    if (this.introOverlay) {
      this.beginIntro();
    } else if (this.startOverlay) {
      this.refreshStartOverlay();
      this.startOverlay.setVisible(true);
    }
  }

  /** 인트로 시작 — 시작 오버레이를 가리고 천천히 세로 슬라이드. Start로만 종료. */
  private beginIntro(): void {
    this.introActive = true;
    if (this.startOverlay) this.startOverlay.setVisible(false);
    const startY = (this.introOverlay.getData("startY") as number) ?? DESIGN_H;
    const endY = (this.introOverlay.getData("endY") as number) ?? DESIGN_H;
    this.introImage.y = startY;
    this.introOverlay.setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(this.introImage);
    this.tweens.add({
      targets: this.introImage,
      y: endY,
      duration: INTRO_MS,
      ease: "Linear", // 급가속 없이 일정 속도로 천천히
      // 끝나면 마지막 프레임에 머무름 — Start를 눌러야 진행
    });
    // Start CTA 부드러운 점멸 — 알파를 완전히 끄지 않아 읽기 유지
    if (this.introNextBtn) {
      this.tweens.killTweensOf(this.introNextBtn);
      this.introNextBtn.setAlpha(1).setScale(1);
      this.tweens.add({
        targets: this.introNextBtn,
        alpha: 0.35,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  /** 인트로 종료(Start) → 시작 안내 창 없이 바로 플레이. */
  private endIntro(_fromStart: boolean): void {
    if (!this.introActive && !this.introOverlay?.visible) return;
    this.introActive = false;
    this.tweens.killTweensOf(this.introImage);
    if (this.introNextBtn) this.tweens.killTweensOf(this.introNextBtn);
    this.introOverlay.setVisible(false);
    // 시작 오버레이("탭하여 점프…")는 건너뜀 — Start = 즉시 인게임
    if (this.startOverlay) this.startOverlay.setVisible(false);
    try {
      window.localStorage.setItem("ga:onboarded", "1");
    } catch {
      /* 무시 */
    }
  }

  /**
   * 봇 고스트로 경쟁 필드를 채운다 — 유저가 적거나 없을 때 호출(콜드스타트 + 보충).
   *
   * 동작:
   *   - 시드별 1회만 생성(플래그 가드) → 봇 로그는 localStorage에 영속 저장.
   *   - 현재 판이 살아있으면 원격+로컬+봇을 병합해 즉시 세션 필드에 반영
   *     (봇이 유저보다 빠르면 거리순 정렬로 상단 랭킹에 노출).
   *   - allowRemoteUpload=true(원격이 비었을 때)에만 원격에도 시딩 → 원격 오염 방지.
   *
   * 왜 봇이 안 보였었나(과거 버그): 봇을 원격에만 올리고 로컬 미저장 + 현재 판 미적용이라
   * 다음 세션에야 처음 보였다. 로컬 저장 + 즉시 병합 적용으로 해소.
   */
  private async uploadBotColdStart(
    seed: number,
    allowRemoteUpload = true,
  ): Promise<void> {
    // r3 = 봇 로그에 티어 기반 meta.nickname 부여 세대 — 일간·주간 이름 일치를 위해 재생성
    const flagKey = `ga:bots:v${SIM_VERSION}-r3:${seed}`;
    try {
      if (window.localStorage.getItem(flagKey)) return;
    } catch {
      return; // localStorage 접근 실패 = 스킵
    }
    // 비동기 버전 — 봇 1기마다 메인 스레드에 양보해 인게임 프레임 드랍 방지
    const { recordAllBotRunsAsync } = await import("../botRecorder");
    const botRuns = await recordAllBotRunsAsync(seed);

    // 봇 로그에 티어(정렬 순위) 기반 닉네임을 메타로 박는다. serializeLog가 meta를
    // 보존하므로 로컬 저장·원격 제출·재생성 모두 동일 이름을 공유한다.
    // → 일간(applyGhostField의 meta.nickname)과 주간(뷰의 meta->>'nickname')이 일치.
    for (let i = 0; i < botRuns.length; i++) {
      const log = botRuns[i]!.log;
      const botNick = deterministicNickname(Math.imul(i + 1, 0x9e3779b9));
      log.meta = { ...(log.meta ?? {}), nickname: botNick };
    }

    // 로컬 저장 먼저 — 네트워크 실패해도 다음 판부터 보임. saveRun이 거리순 top-N 유지.
    for (const { log, distance } of botRuns) {
      saveRun(window.localStorage, seed, log, distance);
    }

    // 현재 판이 살아있고 시드가 일치하면 원격+로컬(봇 포함)을 병합해 즉시 반영.
    // ghosts가 이미 가득 차 있어도 봇이 더 빠르면 상단에 끼어들 수 있게 재병합.
    if (!this.sim.state.gameOver && this.seed === seed) {
      const localNow = loadTopRuns(window.localStorage, seed);
      const mergedNow = this.mergeGhostRecords(this.remoteRuns, localNow);
      this.applyGhostField(mergedNow);
    }

    // 원격 시딩은 원격이 비었을 때만 — 실제 유저가 있는 보드에 봇을 섞지 않는다.
    // 봇에 합성 정체성 부여: bot:tier:i (티어 고정) → 주간 랭킹 뷰에서 7일 누적으로 쌓임.
    if (allowRemoteUpload) {
      for (let i = 0; i < botRuns.length; i++) {
        const { log, distance } = botRuns[i]!;
        const botUserId = `bot:tier:${i}`;
        // 위에서 심은 log.meta.nickname을 그대로 사용 — 일간/주간 이름 동일 보장.
        void submitRunRemote(seed, log, distance, true, log.meta, botUserId);
      }
    }
    try {
      window.localStorage.setItem(flagKey, "1");
    } catch {
      /* 무시 */
    }
  }

  private onTap() {
    // Replay 버튼이 같은 pointerdown으로 startRun한 직후 — 점프 한 번 무시
    if (this.ignoreNextWindowTap) {
      this.ignoreNextWindowTap = false;
      return;
    }
    // 인트로 중엔 Start만 진행 (화면 아무 곳 탭으로는 스킵 안 함)
    if (this.introActive) return;
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
    if (this.sim.state.gameOver) {
      // 3분할 결과 UI: 전체 화면 탭 재시작 제거 — Replay 버튼만 startRun(true).
      // 좌/우 패널·빈 영역 탭은 무시 (스크롤·오탭으로 판이 날아가지 않게).
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
    // 일시정지 진입 시 다시하기 버튼 표시, 해제 시 숨김
    setRestartButtonVisible(this.gamePaused);
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
    // 인트로/시작 오버레이 표시 중: 시뮬·렌더 대기
    if (this.introActive || this.startOverlay.visible) return;
    if (!this.gamePaused) {
      // 렌더 전용 시계 — 레이저·이펙트 연출에만 사용 (sim과 완전 분리)
      this.renderTimeMs += delta;
      this.sunRedrawAccMs += delta;
      this.starRedrawAccMs += delta;
      this.fxRedrawAccMs += delta;
      // 코드 메테오 진행 (렌더 타이머 기반, sim 무관) — 수명 끝난 것 제거
      if (this.codeMeteors.length > 0) {
        for (const m of this.codeMeteors) m.elapsed += delta;
        this.codeMeteors = this.codeMeteors.filter(
          (m) => m.elapsed < m.duration,
        );
      }
      // 오글거리는 말풍선 — 게임 진행 중에만, 일정 간격 랜덤 표시(렌더 전용)
      if (!this.sim.state.gameOver && !this.spectating) {
        this.bubbleMs -= delta;
        if (this.bubbleMs <= 0) {
          this.showSpeechBubble();
          this.bubbleMs = 20000 + Math.random() * 12000; // 20~32초마다 (더 드물게)
        }
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
        // 유령들은 라이브와 lockstep. 내가 죽으면 게임이 즉시 끝나므로 그 뒤엔 멈춘다.
        if (!this.sim.state.gameOver) {
          for (const g of this.ghosts) {
            const wasFinished = g.finished;
            g.step();
            // 유령이 죽는 순간(finished 전환) = 내가 그 기록보다 오래 버팀 = 제침
            if (!wasFinished && g.finished) {
              this.overtakenLive++;
              this.popup("고스트 제침!", "#b39ddb");
            }
          }
        }
        this.handleStepEvents(this.sim.state.events);
      });
    }
    this.syncVisuals();
  }

  /** 코어가 뱉은 이벤트 비트마스크 → 연출 트리거 (스텝당 1회) */
  private handleStepEvents(ev: number) {
    if (ev & C.EV_JUMP) {
      // 모바일 햅틱 — Android Chrome/Firefox 지원, iOS Safari 미지원(조용히 무시).
      // 2단 점프는 조금 더 강하게(40ms). Vibration API 없는 환경은 에러 없이 스킵.
      const isDoubleJump = this.sim.state.player.jumpsUsed >= 2;
      navigator.vibrate?.(isDoubleJump ? 40 : 22);
    }
    if (ev & C.EV_HIT) {
      this.cameras.main.flash(140, 255, 70, 70);
      this.punchZoom(1.07, 90); // 짧고 약하게 — 기존 쉐이크와 중첩
      // 피격 진동 — 점프보다 길고 강하게(타격감).
      navigator.vibrate?.(60);
    }
    if (ev & C.EV_COMBO_BREAK) {
      // 콤보가 끊긴 순간 — 화면 흔들림 + 빨간 팝업
      this.cameras.main.shake(90, 0.005);
      this.popup("BREAK", "#ff4757");
    }
    if (ev & C.EV_POTION) {
      this.showHpPlusToast();
    }
    if (ev & C.EV_FEVER_START) {
      this.feverCount++;
      this.cameras.main.flash(200, 255, 215, 0); // 황금빛 노란 플래시 (피격 빨강과 구분)
      this.punchZoom(1.12, 170); // 주인공 쪽으로 펀치 줌인 — 가속감 강조
      this.feverOverlay.setVisible(true);
      // FEVER TIME! 띠지 슬라이드는 render()에서 feverFramesLeft로 구동
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
      setRestartButtonVisible(false); // 게임오버 → 다시하기 버튼도 숨김
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
      // 로컬 기록에도 내 닉을 심는다 — 원격 제출과 동일 닉. 주간 폴백/일간에서
      // 나를 봇으로 오표기하지 않고 (나) 태깅·실이름 표시가 되도록.
      this.log.meta = {
        ...(this.log.meta ?? {}),
        nickname: getNickname(window.localStorage),
      };
      saveRun(window.localStorage, this.seed, this.log, myDist);

      // 낙관적 반영: 방금 판 기록을 네트워크 왕복 전에 즉시 remoteRuns에 주입.
      // submitRunRemote가 아직 완료되지 않아도 다음 판에서 내 점수가 고스트로 보인다.
      const myRecord = { distance: myDist, log: this.log };
      const localWithMe = loadTopRuns(window.localStorage, this.seed);
      const optimisticMerged = this.mergeGhostRecords(
        [myRecord, ...this.remoteRuns],
        localWithMe,
      );
      this.remoteRuns = optimisticMerged.filter(
        (r) => r !== myRecord,
      );

      // 원격 제출 — 제출 완료 후 ghost 목록 + 주간 랭킹을 체이닝해 읽음.
      // 병렬 레이스 제거: loadTopRunsRemote가 submitRunRemote의 INSERT 이후 실행됨.
      const myUserId = getUserId(window.localStorage);
      const seedForRefresh = this.seed;
      this.weeklyRanks = null;
      void submitRunRemote(
        this.seed,
        this.log,
        myDist,
        false,
        { nickname: getNickname(window.localStorage) },
        myUserId,
      )
        .then(() =>
          Promise.all([
            loadTopRunsRemote(seedForRefresh),
            loadWeeklyRankings(),
          ]),
        )
        .then(([fresh, ranks]) => {
          // 원격 도착본으로 교체 (낙관적 주입본과 중복되지 않게 mergeGhostRecords가 dedup)
          if (fresh.length > 0) this.remoteRuns = fresh;
          this.weeklyRanks = ranks;
          if (this.gameOverRoot?.visible) {
            this.refreshDailyPanel(this.lastResultMyDist);
            this.refreshWeeklyPanel();
          }
        });

      // 구경 모드 제거: 게임오버 즉시 모든 고스트가 함께 쓰러지고(연출은 syncVisuals),
      // 짧게 보여준 뒤 결과 패널을 띄운다. 뒤에 남은 플레이를 보여주지 않는다.
      this.spectating = false;
      const alive = this.ghosts.filter((g) => !g.finished).length;
      console.log(
        `[ghost-arcade] 사망 frame=${this.sim.state.frame}, 생존 유령 ${alive}/${this.ghosts.length} → 즉시 종료`,
      );
      // 고스트 collapse 연출이 보이도록 ~0.9초 후 결과 패널
      // 반환값을 저장 → 재시작 시 취소 가능 (startRun 참조)
      this.resultPanelTimer = this.time.delayedCall(900, () => {
        this.resultPanelTimer = null;
        this.showResultPanel(cmp, myDist);
      });
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
    // ── 개인 최고 거리 비교 ──────────────────────────────────────────────────
    // ga:best-dist: 이전까지 달성한 개인 최고 미터(localStorage 영속).
    let prevBestM = 0;
    let isPersonalBest = false;
    try {
      prevBestM = parseInt(
        window.localStorage.getItem("ga:best-dist") ?? "0",
        10,
      );
      isPersonalBest = Math.floor(myDist) > prevBestM;
      if (isPersonalBest) {
        window.localStorage.setItem("ga:best-dist", String(Math.floor(myDist)));
      }
    } catch {
      /* localStorage 차단 환경 — 무시 */
    }

    // 거리 칩 — 개인 신기록이면 골드 강조. 텍스트 폭에 맞춰 검정 캡슐 재그림.
    this.gameOverDistText
      .setText(`거리  ${Math.floor(myDist)}M`)
      .setColor(isPersonalBest ? "#ffd700" : "#ffffff");
    {
      const tw = Math.max(72, this.gameOverDistText.width);
      const th = Math.max(16, this.gameOverDistText.height);
      const padX = 14;
      const padY = 7;
      const r = Math.round((th + padY * 2) / 2);
      this.gameOverDistChipBg.clear();
      this.gameOverDistChipBg.fillStyle(0x000000, 0.86);
      this.gameOverDistChipBg.fillRoundedRect(
        -tw / 2 - padX,
        -th / 2 - padY,
        tw + padX * 2,
        th + padY * 2,
        r,
      );
      this.gameOverDistChipBg.lineStyle(1.5, 0x36f9f6, 0.45);
      this.gameOverDistChipBg.strokeRoundedRect(
        -tw / 2 - padX,
        -th / 2 - padY,
        tw + padX * 2,
        th + padY * 2,
        r,
      );
    }

    // 개인 신기록 팝업 — 화면 중앙에서 위로 올라가며 사라짐
    if (isPersonalBest) {
      this.showPersonalBestPopup(prevBestM, Math.floor(myDist));
    }

    // ── 최고 등수 저장 (고스트 있을 때만 의미있는 등수) ─────────────────────
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

    // 아깝게 진(isClose) 판만 Replay 아래 힌트로 재도전 유도.
    this.hintText.setText(
      cmp.hasGhosts && !cmp.isRecord && cmp.isClose ? "ONE MORE RUN?" : "",
    );

    this.lastResultMyDist = myDist;
    this.refreshDailyPanel(myDist);
    this.refreshWeeklyPanel();
    this.gameOverRoot.setVisible(true);
    // Replay: 라벨만 점멸. 에셋까지 같이 내리면 프레임이 너무 옅어져 CTA가 약해 보임.
    if (this.replayBg) {
      this.tweens.killTweensOf(this.replayBg);
      this.replayBg.setAlpha(1);
    }
    if (this.replayLabel) {
      this.tweens.killTweensOf(this.replayLabel);
      this.replayLabel.setAlpha(1);
      this.tweens.add({
        targets: this.replayLabel,
        alpha: { from: 1, to: 0.4 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }
  }

  /**
   * 일간(오늘 시드) 거리 순위 — 상단 칩/원격 일간과 같은 기록 풀.
   * 상위 4 + (밖이면) 내 순위. 봇 이름은 applyGhostField와 동일 공식.
   */
  private refreshDailyPanel(myDist: number): void {
    const myNick = getNickname(window.localStorage);
    const local = loadTopRuns(window.localStorage, this.seed);
    const merged = this.mergeGhostRecords(
      [{ distance: myDist, log: this.log }, ...this.remoteRuns],
      local,
    );

    type Row = { distance: number; nickname: string; isMe: boolean };
    const rows: Row[] = merged.map((r, i) => {
      const nick =
        r.log.meta?.nickname ||
        deterministicNickname(Math.imul(i + 1, 0x9e3779b9));
      const isMe =
        Math.abs(r.distance - myDist) < 0.5 &&
        (r.log.meta?.nickname === myNick || r.log === this.log);
      return { distance: r.distance, nickname: nick, isMe };
    });
    // 방금 판이 merge에 빠졌을 때만 보강 (낙관적 주입 실패 대비)
    if (!rows.some((r) => r.isMe) && myDist > 0) {
      rows.push({ distance: myDist, nickname: myNick, isMe: true });
      rows.sort((a, b) => b.distance - a.distance);
    }
    const myIdx = rows.findIndex((r) => r.isMe);

    // "(나)" 생략 — 내 행은 골드로만 구분.
    // 긴 닉이 우측 거리와 겹치면 "-551471"처럼 읽히므로 폭에 맞게 자른다.
    const nameLabel = (r: Row, rank: number) =>
      `${rank}.  ${this.clipNickForPanel(r.nickname)}`;
    const distLabel = (r: Row) =>
      `${Math.floor(r.distance).toLocaleString()}m`;

    for (let i = 0; i < this.dailyRowTexts.length; i++) {
      const name = this.dailyRowTexts[i]!;
      const dist = this.dailyRowDists[i]!;
      const r = rows[i];
      if (!r) {
        name.setText("");
        dist.setText("");
        continue;
      }
      const col = r.isMe ? "#ffd700" : "#e0e0e0";
      const fs = r.isMe ? "bold" : "normal";
      name.setText(nameLabel(r, i + 1)).setColor(col).setFontStyle(fs);
      dist.setText(distLabel(r)).setColor(col).setFontStyle(fs);
    }

    const lastInMe = myIdx >= 4;
    const lastEntry = lastInMe ? rows[myIdx] : rows[4];
    const lastRank = lastInMe ? myIdx + 1 : 5;
    if (lastEntry) {
      const col = lastInMe || lastEntry.isMe ? "#ffd700" : "#e0e0e0";
      const fs = lastInMe || lastEntry.isMe ? "bold" : "normal";
      this.dailyMyText
        .setText(nameLabel(lastEntry, lastRank))
        .setColor(col)
        .setFontStyle(fs);
      this.dailyMyDist
        .setText(distLabel(lastEntry))
        .setColor(col)
        .setFontStyle(fs);
    } else {
      this.dailyMyText.setText("");
      this.dailyMyDist.setText("");
    }
  }

  /**
   * 주간 봇 랭킹을 클라이언트에서 결정론으로 합성한다 (렌더 전용).
   *
   * 왜 서버(DB)를 안 쓰나: 봇은 "원격이 비었을 때만" 업로드돼 실전에선 거의 갱신되지
   * 않고, DB에 남은 레거시 봇 행은 옛 이름/거리로 오염돼 일간 HUD와 어긋난다.
   * → 봇은 여기서 시드 기반으로 매번 동일하게 생성하고, 일간 HUD(applyGhostField)와
   *   똑같은 이름 공식(deterministicNickname(imul(tier+1)))을 써 두 랭킹을 항상 일치시킨다.
   *
   * 거리는 7일 누적을 시뮬 없이 근사 — 봇은 어차피 가상 경쟁자이므로, 티어별 기준값에
   * 시드 지터를 곱한 결정론 값이면 "그럴듯하고 흔들리지 않는" 누적으로 충분하다.
   */
  private synthesizeWeeklyBots(): WeeklyRank[] {
    // 티어0(최속)→티어7 순으로 내림차순 기준 누적(대략치). 일간 최속 봇이 주간 1위가 되게.
    const BASE = [6800, 5000, 3600, 2500, 1600, 950, 500, 240];
    const rows: WeeklyRank[] = [];
    let rng = this.seed | 0;
    for (let t = 0; t < BASE.length; t++) {
      rng = (Math.imul(rng, 1664525) + 1013904223) | 0;
      const jitter = 0.85 + ((rng >>> 8) % 1000) / 1000 * 0.4; // 0.85~1.25
      rows.push({
        user_id: `bot:tier:${t}`,
        nickname: deterministicNickname(Math.imul(t + 1, 0x9e3779b9)),
        total_distance: Math.round(BASE[t]! * 7 * jitter),
        best_distance: Math.round(BASE[t]! * jitter),
        run_count: 7,
      });
    }
    return rows;
  }

  /**
   * 주간 랭킹 패널 내용 갱신 — 상위 N명 + (top N 밖이면) 내 순위 행.
   * 봇은 클라이언트 합성(일간과 동일 이름), 사람은 DB(user_id=UUID)만 병합한다.
   */
  private refreshWeeklyPanel(): void {
    const myUserId = getUserId(window.localStorage);
    const myNick = getNickname(window.localStorage);

    // DB에서는 실제 사람(user_id가 UUID)만 취한다 — 레거시/현행 봇 행은 모두 무시하고
    // 봇은 아래 합성본으로 대체해 일간 HUD와 이름·구성원을 일치시킨다.
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const humans = (this.weeklyRanks ?? []).filter((r) => uuidRe.test(r.user_id));

    const ranks: WeeklyRank[] = [...this.synthesizeWeeklyBots(), ...humans];

    // 내 행 보장 — DB 집계 레이스로 아직 안 잡혔으면 오늘 로컬 최고 기록으로 임시 표기.
    if (!humans.some((r) => r.user_id === myUserId)) {
      const myBest = loadTopRuns(window.localStorage, this.seed)
        .filter((r) => r.log.meta?.nickname === myNick)
        .reduce((m, r) => Math.max(m, r.distance), 0);
      if (myBest > 0) {
        ranks.push({
          user_id: myUserId,
          nickname: myNick,
          total_distance: myBest,
          best_distance: myBest,
          run_count: 1,
        });
      }
    }

    ranks.sort((a, b) => b.total_distance - a.total_distance);
    const myIdx = ranks.findIndex((r) => r.user_id === myUserId);

    // 봇(user_id=bot:tier:N) 이름은 티어에서 재계산 — 일간 HUD와 동일 공식.
    const displayNick = (r: WeeklyRank): string => {
      const m = /^bot:tier:(\d+)$/.exec(r.user_id ?? "");
      if (m) return deterministicNickname(Math.imul(parseInt(m[1]!, 10) + 1, 0x9e3779b9));
      return r.nickname || "이름없는 고스트";
    };

    // (나) 생략 — 내 행은 골드/볼드. 긴 닉은 잘라 거리와 안 겹치게.
    const nameLabel = (r: WeeklyRank, rank: number) =>
      `${rank}.  ${this.clipNickForPanel(displayNick(r))}`;
    const distLabel = (r: WeeklyRank) =>
      `${Math.floor(r.total_distance).toLocaleString()}m`;

    for (let i = 0; i < this.weeklyRowTexts.length; i++) {
      const name = this.weeklyRowTexts[i]!;
      const dist = this.weeklyRowDists[i]!;
      const r = ranks[i];
      if (!r) {
        name.setText("");
        dist.setText("");
        continue;
      }
      const isMe = i === myIdx;
      const col = isMe ? "#ffd700" : "#e0e0e0";
      const fs = isMe ? "bold" : "normal";
      name.setText(nameLabel(r, i + 1)).setColor(col).setFontStyle(fs);
      dist.setText(distLabel(r)).setColor(col).setFontStyle(fs);
    }

    // 마지막(5번째) 칸: 내가 top4 안이면 5등을 넣어 1~5등 정상 노출(내가 1등이어도 중복 없음),
    // top4 밖이면 내 순위를 넣는다. 내가 그 칸의 주인이면 골드, 아니면 일반색.
    const lastInMe = myIdx >= 4;
    const lastEntry = lastInMe ? ranks[myIdx] : ranks[4];
    const lastRank = lastInMe ? myIdx + 1 : 5;
    if (lastEntry) {
      const col = lastInMe ? "#ffd700" : "#e0e0e0";
      const fs = lastInMe ? "bold" : "normal";
      this.weeklyMyText
        .setText(nameLabel(lastEntry, lastRank))
        .setColor(col)
        .setFontStyle(fs);
      this.weeklyMyDist.setText(distLabel(lastEntry)).setColor(col).setFontStyle(fs);
    } else {
      this.weeklyMyText.setText("");
      this.weeklyMyDist.setText("");
    }
  }

  /** 정전 트랩 간격 롤 — 시드 파생 LCG (렌더 전용, sim RNG와 완전 분리) */
  private blackoutRoll(range: number): number {
    this.blackoutLcg = (Math.imul(this.blackoutLcg, 1664525) + 1013904223) | 0;
    return (this.blackoutLcg >>> 8) % (range + 1);
  }

  /**
   * 정전 트랩 상태기 — 매 렌더 프레임 호출 (렌더 전용).
   * idle → warn(1.2s 플리커+경고) → dark(3s 우측 차단) → recover(0.6s 복전) → idle.
   * 발동 거리는 시드 결정론 수열(blackoutNextAtM), 페이즈 전환은 렌더 시계.
   */
  private updateBlackout(s: {
    gameOver: boolean;
    distance: number;
    feverFramesLeft: number;
  }): void {
    if (s.gameOver) {
      // 사망 → 즉시 해제: 결과 패널(depth 0)이 오버레이에 가리지 않게
      if (this.blackoutPhase !== "idle") {
        this.blackoutPhase = "idle";
        this.blackoutGfx.clear();
        this.warnBadge.setVisible(false);
      }
      return;
    }
    const now = this.renderTimeMs;
    const el = now - this.blackoutPhaseStartMs;

    switch (this.blackoutPhase) {
      case "idle":
        if (s.distance >= this.blackoutNextAtM) {
          // 다음 발동 거리는 지금 확정 — 스킵 여부와 무관하게 수열은 전진 (결정론)
          this.blackoutNextAtM += BLACKOUT_GAP_MIN_M + this.blackoutRoll(BLACKOUT_GAP_JITTER_M);
          if (s.feverFramesLeft > 0) break; // 피버 중엔 스킵 — 무적이라 무의미
          this.blackoutPhase = "warn";
          this.blackoutPhaseStartMs = now;
          this.warnBadge.setVisible(true).setAlpha(1);
        }
        break;
      case "warn": {
        // 우측 끝에서 연기 기운이 살짝 어른거림 + WARNING 뱃지 알람형 점멸(0.25↔1.0)
        this.drawBlackoutOverlay(0.1 + 0.08 * Math.abs(Math.sin(now * 0.03)), 0.25);
        this.warnBadge.setAlpha(0.25 + 0.75 * Math.abs(Math.sin(now * 0.022)));
        if (el >= BLACKOUT_WARN_MS) {
          this.blackoutPhase = "dark";
          this.blackoutPhaseStartMs = now;
          this.warnBadge.setVisible(false);
        }
        break;
      }
      case "dark": {
        // 연기가 우측 끝에서 중앙까지 천천히 밀려온다 (ease-out) + 알파 램프
        const sp = Math.min(1, el / BLACKOUT_SWEEP_IN_MS);
        const sweep = 1 - (1 - sp) * (1 - sp);
        this.drawBlackoutOverlay(
          BLACKOUT_MAX_ALPHA * Math.min(1, el / (BLACKOUT_SWEEP_IN_MS * 0.5)),
          sweep,
        );
        if (el >= BLACKOUT_DARK_MS) {
          this.blackoutPhase = "recover";
          this.blackoutPhaseStartMs = now;
        }
        break;
      }
      case "recover": {
        // 왼쪽부터 걷혀 우측으로 밀려나며 사라짐 (sweep 1→0). 알파 페이드만 하면 "그냥 증발"로 보임.
        const p = Math.min(1, el / BLACKOUT_FADE_OUT_MS);
        const ease = p * p; // ease-in — 초반 천천히, 끝에서 빠르게 빠짐
        const sweep = 1 - ease;
        this.drawBlackoutOverlay(BLACKOUT_MAX_ALPHA, sweep);
        if (p >= 1) {
          this.blackoutPhase = "idle";
          this.blackoutGfx.clear();
        }
        break;
      }
    }
  }

  /**
   * 연막 오버레이 드로우 — sweep(0→1)만큼 우측 끝에서 경계가 전진하고,
   * 경계는 밴드별 sin 위상차로 연기처럼 넘실댄다. 경계엔 그라데이션.
   */
  private drawBlackoutOverlay(alpha: number, sweep: number): void {
    const g = this.blackoutGfx;
    g.clear();
    if (alpha <= 0.002 || sweep <= 0.002) return;
    // 덮개 왼쪽 경계 — sweep 0→1 동안 화면 우측 끝에서 EDGE0까지 전진
    const edge = DESIGN_W - (DESIGN_W - BLACKOUT_EDGE0) * sweep;
    const bands = 8;
    const bandH = DESIGN_H / bands;
    const steps = 6;
    const stepW = BLACKOUT_GRAD_W / steps;
    const t = this.renderTimeMs;
    for (let b = 0; b < bands; b++) {
      // 밴드별 위상이 다른 가장자리 일렁임 — 직선 경계 대신 연기 느낌
      const e = edge + Math.sin(t * 0.0018 + b * 0.9) * 16 - BLACKOUT_GRAD_W;
      const y = b * bandH;
      for (let i = 0; i < steps; i++) {
        g.fillStyle(BLACKOUT_COLOR, alpha * ((i + 1) / steps));
        g.fillRect(e + i * stepW, y, stepW + 1, bandH + 1);
      }
      g.fillStyle(BLACKOUT_COLOR, alpha);
      const solidX = e + BLACKOUT_GRAD_W;
      if (solidX < DESIGN_W) g.fillRect(solidX, y, DESIGN_W - solidX, bandH + 1);
    }
  }

  /**
   * 주인공 쪽 펀치 줌 — 카메라를 잠깐 확대했다 복귀 (렌더 전용, 요요 트윈).
   * 주인공 위치를 고정점으로 줌·팬을 함께 움직여 "주인공에게 파고드는" 느낌.
   * 간단 버전: HUD도 같은 카메라를 쓰므로 factor ≤ 1.15, 왕복 0.4s 이내로만 —
   * 더 길고 깊은 줌이 필요해지면 UI 전용 카메라 분리로 승격할 것.
   */
  private punchZoom(factor: number, halfMs: number): void {
    const cam = this.cameras.main;
    this.tweens.killTweensOf(this.zoomPunch);
    this.zoomPunch.t = 0;
    // 고정점: 바이크 몸통 근방 (지면 위 50px). 줌 중에도 이 점은 화면상 제자리.
    const px = toScreenX(C.PLAYER_X);
    const py = toScreenY(50);
    const cx0 = DESIGN_W / 2;
    const cy0 = DESIGN_H / 2;
    this.tweens.add({
      targets: this.zoomPunch,
      t: 1,
      duration: halfMs,
      yoyo: true,
      ease: "Quad.out",
      onUpdate: () => {
        const z = 1 + (factor - 1) * this.zoomPunch.t;
        cam.setZoom(RENDER_DPR * z);
        // 고정점 p 유지: 새 중심 c' = p + (c0 − p)/z
        cam.centerOn(px + (cx0 - px) / z, py + (cy0 - py) / z);
      },
      onComplete: () => {
        cam.setZoom(RENDER_DPR).centerOn(cx0, cy0);
      },
    });
  }

  /**
   * 1000m 단위 응원 토스트 — 우측 하단에서 슬라이드 업 → 잠시 유지 → 슬라이드 다운.
   * (중앙 ⚡ NM 팡파레는 제거됨 — 시야 방해)
   * 전용 상반신+굿제스처 에셋이 오면 `milestone-cheer` 키로 교체(docs/design/milestone-cheer-asset.md).
   */
  private showMilestoneCheer(meters: number): void {
    if (this.milestoneToast) {
      this.tweens.killTweensOf(this.milestoneToast);
      this.milestoneToast.destroy();
      this.milestoneToast = undefined;
    }
    const m = meters.toLocaleString();
    const lines = [
      `${m}m, 대단한데?`,
      `${m}m, 계속 가보자구!`,
      `${m}m, 조금 더 가보자!`,
      `${m}m, 이 기세로 가자!`,
      `${m}m, 아직 끝이 아니야!`,
      `${m}m, 리듬 좋다!`,
      `${m}m, 한 번 더 밀어봐!`,
      `${m}m, 불꽃 질주 중!`,
    ];
    const msg = lines[Math.floor(Math.random() * lines.length)]!;

    const kids: Phaser.GameObjects.GameObject[] = [];
    // 전용 에셋 우선, 없으면 주행 시트 1프레임으로 임시 초상
    const texKey = this.textures.exists("milestone-cheer")
      ? "milestone-cheer"
      : "player-ride";
    const portrait = this.add
      .image(0, 0, texKey, texKey === "player-ride" ? 0 : undefined)
      .setOrigin(0.5, 1);
    const ph = 110;
    portrait.setDisplaySize(
      (portrait.width / Math.max(1, portrait.height)) * ph,
      ph,
    );
    kids.push(portrait);

    const label = this.add
      .text(0, 0, msg, {
        fontSize: "14px",
        fontFamily: FONT_KR,
        color: "#ffffff",
        align: "center",
        resolution: TXT_RES,
        wordWrap: { width: 200 },
      })
      .setOrigin(0.5);
    const padX = 12;
    const padY = 8;
    const bw = label.width + padX * 2;
    const bh = label.height + padY * 2;
    const box = this.add.graphics();
    box.fillStyle(0x000000, 0.82);
    box.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);
    box.lineStyle(1.5, 0x36f9f6, 0.55);
    box.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);
    // 말풍선 꼬리 → 초상 쪽
    box.fillStyle(0x000000, 0.82);
    box.fillTriangle(-8, bh / 2 - 1, 8, bh / 2 - 1, 0, bh / 2 + 10);
    const bubble = this.add.container(0, -ph - 18, [box, label]);
    kids.push(bubble);

    const restX = DESIGN_W - 88;
    const restY = DESIGN_H - 18;
    const hiddenY = DESIGN_H + 40;
    const c = this.add
      .container(restX, hiddenY, kids)
      .setDepth(35)
      .setAlpha(0);
    this.milestoneToast = c;
    this.tweens.add({
      targets: c,
      y: restY,
      alpha: 1,
      duration: 420,
      ease: "Back.out",
    });
    this.tweens.add({
      targets: c,
      y: hiddenY,
      alpha: 0,
      delay: 2200,
      duration: 380,
      ease: "Cubic.in",
      onComplete: () => {
        if (this.milestoneToast === c) this.milestoneToast = undefined;
        c.destroy();
      },
    });
  }

  /** 개인 신기록 달성 팝업 — 화면 중앙에서 위로 올라가며 사라짐 */
  private showPersonalBestPopup(prevBestM: number, nowM: number): void {
    const cx = DESIGN_W / 2;
    const cy = DESIGN_H * 0.28;
    const diff = nowM - prevBestM;
    const label =
      prevBestM > 0 ? `✨ PERSONAL BEST  +${diff}M` : "✨ PERSONAL BEST";

    const txt = this.add
      .text(cx, cy, label, {
        fontSize: "22px",
        fontFamily: FONT_HUD,
        fontStyle: "bold",
        color: "#ffd700",
        resolution: TXT_RES,
      })
      .setOrigin(0.5)
      .setStroke("#1a0010", 5)
      .setDepth(60)
      .setAlpha(0);

    this.tweens.add({
      targets: txt,
      alpha: 1,
      duration: 180,
      ease: "Cubic.out",
    });
    this.tweens.add({
      targets: txt,
      y: cy - 55,
      alpha: 0,
      delay: 900,
      duration: 700,
      ease: "Cubic.in",
      onComplete: () => txt.destroy(),
    });
  }

  /**
   * 일본어 네온 간판 데코 생성 — 먼 배경(L2)에 흩뿌려 시티팝 분위기.
   * 각 간판을 x, x+DESIGN_W 두 벌로 두어 1040px 주기로 심리스 반복(스카이라인과 동일 트릭).
   */
  private makeSignageDecor(): Phaser.GameObjects.Image[] {
    // [텍스처키, x, 바닥y, 표시높이] — 원경이므로 작게·은은하게, 플레이 레인(하단) 위에만.
    const defs: [string, number, number, number][] = [
      ["sign-yakou", 120, 386, 92],
      ["sign-hotel", 470, 374, 86],
      ["sign-shinya", 720, 398, 66],
      ["sign-music", 905, 380, 96],
    ];
    const out: Phaser.GameObjects.Image[] = [];
    for (const [key, x, by, h] of defs) {
      for (const dx of [0, DESIGN_W]) {
        const img = this.add.image(x + dx, by, key).setOrigin(0.5, 1);
        img.setDisplaySize((img.width / img.height) * h, h).setAlpha(0.72);
        out.push(img);
      }
    }
    return out;
  }

  /** 배경 레이어 1회 생성 (하늘·노을 선·먼 스카이라인·바닥 그리드). 전부 렌더 전용. */
  private createBackground() {
    // 1) 하늘 그라데이션 (상단 인디고 → 지평선 마젠타). 지평선 위만 덮는다.
    // 바이옴 전환 시 drawSky()로 재드로우 — 평상시엔 정적.
    this.skyGfx = this.add.graphics();
    this.drawSky(BIOMES[0]!);

    // 1★) 밤하늘 네온 노란 별 — 하늘 위·태양/메테오 아래. 고정 시드 좌표 + 느린 twinkle.
    this.starGfx = this.add.graphics();
    this.initStarField();
    this.drawStars();

    // 1a) 레이저 이펙트 Graphics — 하늘 직후, 메테오·태양보다 먼저 add → 태양 뒤에 렌더.
    this.laserGraphics = this.add.graphics();

    // 1b) 코드 드로우 메테오 Graphics — 연막(blackout depth 6) 아래, 배경·태양 위.
    //     이유: 연막이 나왔을 때 메테오가 연막 위로 뜨면 "연막이 가리지 못함"처럼 보임.
    //     HUD(랭킹 칩 depth 22)보다는 아래 — 메테오가 칩을 가리지 않음.
    this.meteorGfx = this.add.graphics().setDepth(5);

    // 2) 레트로웨이브 코드 태양 — syncVisuals에서 저주파로 일렁이며 재드로우.
    // Graphics.setPosition(0, 214) 으로 기준점을 scene y=214에 두고, 드로우는 로컬 좌표(y=0이 센터).
    this.sunGraphics = this.add.graphics();
    this.sunGraphics.setPosition(0, 214).setAlpha(0.95);
    this.updateCodeSun(); // 첫 프레임 즉시 그림 (스로틀 대기 없이)

    // 3) 원경 이미지 TileSprite 3종 (스카이라인/고속도로다리/아치형다리) — 가장 뒤(원경).
    //     ★ 유저 요청: 이미지 배경은 뒤로 흐리게, 코드 스카이라인(간판+작은 검은 건물)은
    //       앞으로 진하게. 그래서 이미지 타일을 먼저 add(뒤에 렌더)한다.
    //     prep-bg.py 출력 폭 = 2048. 각 높이는 실제 텍스처 높이 × tileScale(수직 타일링 방지).
    {
      const texH = (key: string) => this.textures.get(key).getSourceImage().height;
      // ★ 태양 중심(y≈214)의 '절반 위'로 안 넘게 표시 높이를 캡한다. 지면(432)에서 위로 최대
      //   MAX_BG_H까지 → 건물/다리 top ≥ 227. 폭 배율도 같이 낮춰 종횡비 유지(찌부 방지).
      //   가로가 화면보다 좁아지면 tileSprite가 seamless로 반복해 채운다.
      const MAX_BG_H = 205;
      const fitScale = (key: string) =>
        Math.min(DESIGN_W / 2048, MAX_BG_H / texH(key));
      const mkTile = (key: string, alpha: number) => {
        const s = fitScale(key);
        const dispH = Math.round(texH(key) * s);
        return this.add
          .tileSprite(0, GROUND_Y_PX - dispH, DESIGN_W, dispH, key)
          .setOrigin(0, 0)
          .setTileScale(s, s)
          .setAlpha(alpha);
      };
      this.bgBuildingsTile = mkTile("bg-buildings-far", 0.4);
      this.bgBridgesTile = mkTile("bg-bridges-far", 0.0);
      this.bgBridgesCurvedTile = mkTile("bg-bridges-curved-far", 0.0);
    }

    // 3b) 코드 도시 실루엣 + 일본어 네온 간판 — 이미지 타일 뒤에 add → 앞(전경)에 진하게 렌더.
    //     한 컨테이너로 묶어 함께 패럴랙스. 간판은 초기 배경 감성의 핵심이라 진하게 유지.
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
    // 코드 스카이라인은 전경 실루엣으로 진하게(간판은 makeSignageDecor 내부 알파 유지).
    g1.setAlpha(1.0);
    g2.setAlpha(1.0);

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

  /** 하늘 그라데이션 재드로우 — 바이옴 전환 크로스페이드 중에만 매 프레임 호출. */
  private drawSky(pal: BiomePalette) {
    const g = this.skyGfx;
    g.clear();
    g.fillGradientStyle(pal.skyTop, pal.skyTop, pal.skyLow, pal.skyLow, 1);
    g.fillRect(0, 0, DESIGN_W, GROUND_Y_PX);
  }

  /**
   * 밤하늘 별 좌표 — 고정 시드 LCG로 한 번만 생성.
   * 지평선 위·태양 디스크와 겹치지 않게 상단~중상단에 흩뿌림.
   */
  private initStarField(): void {
    const stars: typeof this.starField = [];
    let seed = 0x5eedcafe;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const SUN_CX = DESIGN_W * 0.5;
    const SUN_CY = 214;
    const SUN_R = 130; // 태양 블룸 바깥까지 비움
    const N = 32;
    let tries = 0;
    while (stars.length < N && tries < N * 8) {
      tries++;
      const x = 8 + rnd() * (DESIGN_W - 16);
      const y = 10 + rnd() * (GROUND_Y_PX * 0.52);
      const dx = x - SUN_CX;
      const dy = y - SUN_CY;
      if (dx * dx + dy * dy < SUN_R * SUN_R) continue;
      stars.push({
        x,
        y,
        r: 0.55 + rnd() * 1.35,
        phase: rnd() * Math.PI * 2,
        tw: 0.7 + rnd() * 1.4,
      });
    }
    this.starField = stars;
  }

  /** 네온 노란 별 — soft glow + 십자 스파클. ≈20fps 스로틀로 호출. */
  private drawStars(): void {
    const g = this.starGfx;
    g.clear();
    const t = this.renderTimeMs * 0.001;
    for (const s of this.starField) {
      const twinkle =
        0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.tw + s.phase));
      const a = twinkle;
      // 외곽 헤일로
      g.fillStyle(0xffe566, 0.12 * a);
      g.fillCircle(s.x, s.y, s.r * 3.2);
      g.fillStyle(0xffd400, 0.28 * a);
      g.fillCircle(s.x, s.y, s.r * 1.6);
      // 코어
      g.fillStyle(0xfff8c0, 0.85 * a + 0.15);
      g.fillCircle(s.x, s.y, s.r * 0.55);
      // 십자 스파클 (큰 별만)
      if (s.r > 1.2) {
        const arm = s.r * (2.8 + 1.2 * twinkle);
        g.lineStyle(1.1, 0xffe566, 0.55 * a);
        g.lineBetween(s.x - arm, s.y, s.x + arm, s.y);
        g.lineBetween(s.x, s.y - arm, s.x, s.y + arm);
      }
    }
  }

  /** 바닥 네온 그리드. worldPx만큼 좌측으로 흐르는 원근 그리드 (매 프레임 redraw). */
  private drawGroundGrid(worldPx: number, pal: BiomePalette = BIOMES[0]!) {
    const g = this.groundGrid;
    g.clear();
    const horizon = GROUND_Y_PX;
    const bottom = DESIGN_H;
    const cx = DESIGN_W * 0.5;
    const depth = bottom - horizon;
    const neon = pal.grid;

    // 바닥 베이스 — 세로 그라데이션(지평선쪽 보라빛 → 바닥은 더 어둡게)으로 평면감 완화.
    g.fillGradientStyle(
      pal.groundTop,
      pal.groundTop,
      COLOR_GROUND_DARK,
      COLOR_GROUND_DARK,
      1,
    );
    g.fillRect(0, horizon, DESIGN_W, depth);

    // 지평선 글로우 밴드 — 지평선 위아래로 번지는 네온 발광(블룸 느낌).
    for (let i = 0; i < 3; i++) {
      g.fillStyle(neon, 0.16 * (1 - i / 3));
      g.fillRect(0, horizon - 2 + i * 2, DESIGN_W, 2);
    }

    // 스크롤되는 원근 수평선 — 지평선에서 생겨나 바닥으로 가속(달리는 속도감).
    // p*p 원근으로 바닥쪽일수록 간격이 빠르게 벌어진다.
    const rows = 10;
    const scroll = (((worldPx / GRID_SPACING) % 1) + 1) % 1; // 0..1 진행 위상
    for (let i = 0; i < rows; i++) {
      const p = (i + scroll) / rows; // 0(지평선)→1(바닥)
      const y = horizon + depth * (p * p);
      g.lineStyle(1, neon, 0.05 + 0.24 * p); // 가까울수록 진하게
      g.lineBetween(0, y, DESIGN_W, y);
    }

    // 지평선 메인 라인(위 글로우 위에 또렷하게).
    g.lineStyle(2, neon, 0.9);
    g.lineBetween(0, horizon, DESIGN_W, horizon);

    // 수직 그리드(바닥에서 바깥으로 퍼지는 원근감, 좌측으로 흐름).
    g.lineStyle(1, neon, 0.2);
    const off = worldPx % GRID_SPACING;
    for (let gx = -off; gx <= DESIGN_W + GRID_SPACING; gx += GRID_SPACING) {
      const bx = cx + (gx - cx) * 2.0;
      g.lineBetween(gx, horizon, bx, bottom);
    }

    // 플레이어 주행 레인 반사 띠 — 바닥 중간에 옅은 시안 띠로 주행감/입체감 강조.
    g.fillStyle(neon, 0.045);
    g.fillRect(0, horizon + depth * 0.5, DESIGN_W, depth * 0.16);
  }

  /**
   * 장애물 주변에서 피어오르는 연기 — 코드 드로우, 렌더 전용(sim 무관).
   * 동그라미가 아니라 '두꺼운 웨이브 선'으로 표현: 장애물 꼭대기에서 위로 올라가며
   * 좌우로 흔들리는(sin 합성) 선을 세그먼트로 그려 아래는 굵고 위로 갈수록 가늘고 옅게.
   */
  /**
   * 코드 드로우 장애물 렌더 (Tier 2-1):
   *   code-flame-s/m/l  → 바닥에서 솟는 네온 화염분수 (높이 3종)
   *   code-sludge        → 오염수/구정물 분수 (회색+녹색)
   * 충돌 박스는 sim의 o.h 직사각형(버전 무관) — 시각만 코드 드로우.
   */
  private drawCodeObstacles(world: {
    obstacles: { active: boolean; x: number; h: number }[];
  }): void {
    const g = this.codeObsGfx;
    g.clear();
    const t = this.renderTimeMs * 0.001;

    for (let i = 0; i < C.MAX_OBSTACLES; i++) {
      const o = world.obstacles[i]!;
      if (!o.active) continue;
      const key = this.obstacleType[i] ?? "";
      if (!key.startsWith("code-")) continue;

      const sx = toScreenX(o.x);
      const baseY = GROUND_Y_PX;
      const isSludge = key === "code-sludge";

      // 높이 결정: flame-s/m/l → 작게/보통/크게, sludge → 중간
      const heightMult =
        key === "code-flame-s" ? 0.85 : key === "code-flame-l" ? 1.25 : 1.0;
      const artH = o.h * OBSTACLE_ART_SCALE * heightMult;

      if (isSludge) {
        this.drawSludgeFountain(g, sx, baseY, artH, t, i);
      } else {
        this.drawFlameFountain(g, sx, baseY, artH, t, i);
      }
    }
  }

  /**
   * 네온 화염분수 — 바닥에서 솟구치는 활활 타오르는 불꽃.
   * 각 불혀를 '다분절 곡선 리본'(drawWavyTongue)으로 그려 일렁이며 휘날리는 디테일을 살린다.
   * 아래는 두껍고 위로 갈수록 뾰족·휘어지며, 가닥마다 위상이 달라 자연스럽게 흔들린다.
   */
  private drawFlameFountain(
    g: Phaser.GameObjects.Graphics,
    sx: number,
    baseY: number,
    artH: number,
    t: number,
    idx: number,
  ): void {
    const phase = idx * 2.3;
    const baseHalf = Math.max(14, artH * 0.42); // 밑동 반폭 — 두껍게

    // 베이스 글로우 (넓게 깔린 불빛, 맥동)
    const pulse = 0.7 + 0.3 * Math.sin(t * 8 + phase);
    g.fillStyle(0xff5a1c, 0.16 * pulse);
    g.fillCircle(sx, baseY - 2, baseHalf * 1.5 * pulse);
    g.fillStyle(0xff9a3c, 0.22 * pulse);
    g.fillCircle(sx, baseY - 2, baseHalf * 0.9);

    // 불혀 다발 — 바깥(짙은 빨강)·안(흰노랑 코어). 가닥 수를 줄여 60fps 예산 확보.
    const layers = [
      { color: 0xb91d1d, hMul: 1.0, wMul: 1.0, tongues: 5, alpha: 0.42 },
      { color: 0xff7a1c, hMul: 0.82, wMul: 0.7, tongues: 4, alpha: 0.58 },
      { color: 0xffb43c, hMul: 0.62, wMul: 0.45, tongues: 3, alpha: 0.72 },
      { color: 0xfff3c0, hMul: 0.42, wMul: 0.26, tongues: 2, alpha: 0.9 },
    ];

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]!;
      const layerH = artH * layer.hMul;
      const layerHalf = baseHalf * layer.wMul;
      for (let s = 0; s < layer.tongues; s++) {
        // 불혀를 밑동 폭에 고르게 분포(-1..1)
        const u = layer.tongues === 1 ? 0 : (s / (layer.tongues - 1)) * 2 - 1;
        const rootX = sx + u * layerHalf;
        const rootW = Math.max(2, (layerHalf / layer.tongues) * 2.2); // 밑동 두께(겹치게)
        // 가닥별 높이 깜빡임 — 가운데가 가장 높음(분수형), 빠른 깜빡임으로 활활.
        const heightFall = 1 - Math.abs(u) * 0.4;
        const flick = 0.7 + 0.3 * Math.sin(t * (6 + s * 0.7) + phase + s * 1.7);
        const tipH = layerH * heightFall * flick;
        const seed = phase + s * 1.3 + li * 0.6; // 가닥 고유 흔들림 위상
        this.drawWavyTongue(
          g,
          rootX,
          baseY,
          rootW,
          tipH,
          t,
          seed,
          u,
          layer.color,
          layer.alpha,
        );
      }
    }

    // 솟구치는 불씨 — 위로 떠오르며 반짝이는 점들(색·반짝임 다양화).
    for (let e = 0; e < 4; e++) {
      const rise = (t * (0.8 + e * 0.1) + e * 0.21) % 1; // 0→1
      const ex = sx + Math.sin(t * 4 + e * 2) * baseHalf * 0.7;
      const ey = baseY - rise * artH * 1.15;
      const tw = 0.5 + 0.5 * Math.sin(t * 18 + e * 3); // 빠른 반짝임
      const ea = (1 - rise) * 0.85 * tw;
      const col = e % 3 === 0 ? 0xfff3c0 : e % 3 === 1 ? 0xffd27a : 0xff7a1c;
      g.fillStyle(col, ea);
      g.fillCircle(ex, ey, (1 - rise) * 2.0 + 0.5);
    }

    // 사방으로 튀는 스파크 — 밑동에서 좌우로 부채꼴로 퍼지며 솟구쳤다 살짝 떨어짐(중력).
    for (let k = 0; k < 6; k++) {
      const life = (t * (1.1 + k * 0.11) + k * 0.31) % 1; // 0→1 수명
      const side = ((k % 6) / 5 - 0.5) * 2; // -1..1 좌우 분산
      const px = sx + side * baseHalf * 1.7 * life;
      const py =
        baseY -
        life * artH * (1.0 + (k % 3) * 0.28) +
        life * life * artH * 0.28; // 솟다 떨어짐
      const tw = 0.5 + 0.5 * Math.sin(t * 26 + k * 5);
      const a = (1 - life) * 0.9 * tw;
      g.fillStyle(k % 2 === 0 ? 0xffe7a0 : 0xff9a3c, a);
      g.fillCircle(px, py, (1 - life) * 1.7 + 0.4);
    }
  }

  /**
   * 불혀 1가닥을 '다분절 곡선 리본'으로 채워 그린다(렌더 전용).
   * 중심선이 위로 갈수록 진폭↑인 다중 사인으로 일렁이고, 폭은 밑동→끝점으로 테이퍼되어 뾰족해진다.
   * 바깥쪽 가닥은 u 방향으로 살짝 휘어(분수 splay) 더 역동적으로 보인다.
   */
  private drawWavyTongue(
    g: Phaser.GameObjects.Graphics,
    rootX: number,
    baseY: number,
    rootW: number,
    tipH: number,
    t: number,
    seed: number,
    u: number,
    color: number,
    alpha: number,
  ): void {
    const SEG = 5;
    const cx: number[] = [];
    const cy: number[] = [];
    const hw: number[] = [];
    for (let k = 0; k <= SEG; k++) {
      const f = k / SEG; // 0(밑동)→1(끝)
      // 흔들림: 위로 갈수록 진폭↑, 두 주파수 합성으로 불규칙하게.
      const amp = rootW * 0.5 + f * tipH * 0.18;
      const wob =
        Math.sin(t * 4 + f * 4.5 + seed) * amp +
        Math.sin(t * 7.3 + f * 2.1 + seed * 1.7) * amp * 0.4;
      const lean = u * f * tipH * 0.12; // 바깥 가닥일수록 더 휨
      cx.push(rootX + wob + lean);
      cy.push(baseY - f * tipH);
      hw.push(Math.max(0, rootW * Math.pow(1 - f, 0.7))); // 끝으로 갈수록 뾰족
    }

    // 폴리곤: 왼쪽 에지(밑→끝) → 오른쪽 에지(끝→밑) 순으로 닫힌 리본.
    const core: Phaser.Types.Math.Vector2Like[] = [];
    for (let k = 0; k <= SEG; k++) core.push({ x: cx[k]! - hw[k]!, y: cy[k]! });
    for (let k = SEG; k >= 0; k--) core.push({ x: cx[k]! + hw[k]!, y: cy[k]! });

    // 소프트 에지 halo — 같은 형태를 살짝 넓혀 반투명으로 한 번 더(경계 페이드).
    const halo: Phaser.Types.Math.Vector2Like[] = [];
    const m = rootW * 0.6; // halo 두께
    for (let k = 0; k <= SEG; k++)
      halo.push({ x: cx[k]! - hw[k]! - m * (1 - k / SEG), y: cy[k]! });
    for (let k = SEG; k >= 0; k--)
      halo.push({ x: cx[k]! + hw[k]! + m * (1 - k / SEG), y: cy[k]! });
    g.fillStyle(color, alpha * 0.2);
    g.fillPoints(halo, true);

    // 선명한 코어
    g.fillStyle(color, alpha);
    g.fillPoints(core, true);
  }

  /**
   * 오염수/구정물 분수 — 독성 녹색+회색, 두꺼운 덩어리가 솟구쳤다 흘러내리는 느낌.
   * 화염분수와 같은 fillTriangle 레이어 방식으로 재설계.
   */
  private drawSludgeFountain(
    g: Phaser.GameObjects.Graphics,
    sx: number,
    baseY: number,
    artH: number,
    t: number,
    idx: number,
  ): void {
    const phase = idx * 1.7;
    const baseHalf = Math.max(12, artH * 0.38); // 밑동 반폭

    // 바닥 웅덩이 — 독성 녹색 글로우
    const pulse = 0.65 + 0.35 * Math.sin(t * 4.5 + phase);
    g.fillStyle(0x4dcc5a, 0.14 * pulse);
    g.fillCircle(sx, baseY - 2, baseHalf * 1.55 * pulse);
    g.fillStyle(0x2f9940, 0.2 * pulse);
    g.fillCircle(sx, baseY - 2, baseHalf * 0.8);

    // 덩어리 레이어 — 화염과 같은 방식이지만 더 뭉툭하고 느린 진폭
    const layers = [
      { color: 0x1a4d1a, hMul: 1.0, wMul: 1.0, tongues: 7, alpha: 0.55 }, // 짙은 회록
      { color: 0x2e7d32, hMul: 0.82, wMul: 0.72, tongues: 5, alpha: 0.65 }, // 어두운 녹
      { color: 0x4caf50, hMul: 0.6, wMul: 0.48, tongues: 4, alpha: 0.72 }, // 독성 녹
      { color: 0xb9f6ca, hMul: 0.38, wMul: 0.26, tongues: 2, alpha: 0.8 }, // 밝은 코어
    ];

    for (const layer of layers) {
      const lH = artH * layer.hMul;
      const lHalf = baseHalf * layer.wMul;
      for (let s = 0; s < layer.tongues; s++) {
        const u = layer.tongues === 1 ? 0 : (s / (layer.tongues - 1)) * 2 - 1;
        const rootX = sx + u * lHalf;
        const rootW = (lHalf / layer.tongues) * 2.1;
        const heightFall = 1 - Math.abs(u) * 0.35;
        const flick =
          0.8 + 0.2 * Math.sin(t * (3.5 + s * 0.5) + phase + s * 1.5);
        const tipH = lH * heightFall * flick;
        const sway =
          Math.sin(t * 2.8 + s * 0.8 + phase) *
          artH *
          0.07 *
          (0.3 + Math.abs(u));
        const tipX = rootX + sway;
        const midX = (rootX + tipX) / 2;
        const midY = baseY - tipH * 0.45;

        // ── 소프트 에지 halo 2단 ──
        g.fillStyle(layer.color, layer.alpha * 0.1);
        g.fillTriangle(
          rootX - rootW * 1.55,
          baseY,
          rootX + rootW * 1.55,
          baseY,
          tipX,
          baseY - tipH * 1.06,
        );
        g.fillStyle(layer.color, layer.alpha * 0.22);
        g.fillTriangle(
          rootX - rootW * 1.25,
          baseY,
          rootX + rootW * 1.25,
          baseY,
          tipX,
          baseY - tipH * 1.03,
        );

        // ── 실제 덩어리 ──
        g.fillStyle(layer.color, layer.alpha);
        g.fillTriangle(
          rootX - rootW,
          baseY,
          rootX + rootW,
          baseY,
          tipX,
          baseY - tipH,
        );
        g.fillTriangle(rootX - rootW, baseY, midX, midY, tipX, baseY - tipH);
      }
    }

    // 솟구치는 독성 방울 — 느리게 올라가며 떨어짐
    for (let e = 0; e < 4; e++) {
      const rise = (t * (0.55 + e * 0.08) + e * 0.31) % 1;
      const ex = sx + Math.sin(t * 2.5 + e * 1.8) * baseHalf * 0.55;
      const ey = baseY - rise * artH * 0.95;
      const ea = (1 - rise) * 0.75;
      g.fillStyle(e % 2 === 0 ? 0x69f07a : 0x2e7d32, ea);
      g.fillCircle(ex, ey, (1 - rise * 0.6) * 3.2 + 0.8);
    }
  }

  /**
   * 네온 트레일 — 바이크 뒤로 왼쪽 방향 수평 속도선 렌더 (Tier 1-3, 렌더 전용).
   * 수직이 아닌 수평 베이스라인처럼: 점프해도 항상 지면 기준 고정 높이에서 뻗음.
   * 속도에 비례해 길이·밝기가 강해지고 반짝임.
   */
  private drawNeonTrail(
    speed: number,
    gameOver: boolean,
    playerScreenY: number,
  ): void {
    const g = this.trailGfx;
    g.clear();
    if (gameOver) return;

    const SPEED_REF = 300;
    const intensity = Math.min(speed / SPEED_REF, 1);
    if (intensity < 0.05) return;

    const t = this.renderTimeMs * 0.001;
    const baseX = toScreenX(C.PLAYER_X); // 바이크 화면 X (고정)
    // 바이크 기준(플레이어 화면 Y)에서 위로 띄운 4줄 — 점프하면 함께 올라감.
    const yLevels = [
      playerScreenY - PLAYER_ART_H * 0.1, // 뒷바퀴 근처
      playerScreenY - PLAYER_ART_H * 0.3, // 차체 하부
      playerScreenY - PLAYER_ART_H * 0.5, // 차체 중간
      playerScreenY - PLAYER_ART_H * 0.68, // 라이더 허리
    ];
    // 줄마다 색을 번갈아 — 시안↔밝은 화이트시안으로 더 화려하게
    const colors = [0x5efce8, 0x9efff7, 0x5efce8, 0xcaffff];

    for (let li = 0; li < yLevels.length; li++) {
      const baseY = yLevels[li]!;
      const phase = li * 1.3;
      // 고주파 깜빡임 — 더 번쩍이게
      const flicker = 0.45 + 0.55 * Math.sin(t * 16 + phase);
      const col = colors[li % colors.length]!;

      // 선 길이: 속도 비례 + 줄마다 살짝 다름
      const maxLen = (70 + li * 22) * intensity;
      const segs = 8;
      for (let s = segs; s >= 1; s--) {
        const f = s / segs; // 1=바이크 근처, 0=끝
        const x0 = baseX - (maxLen * (s - 1)) / segs;
        const x1 = baseX - (maxLen * s) / segs;
        // 살짝 흐르는 미세 웨이브(수평 기조 유지)
        const wobble = Math.sin(t * 9 + phase + s * 0.5) * 1.2;
        const y = baseY + wobble;
        const alpha = f * f * 0.7 * intensity * flicker;
        const lineW = (1.0 + f * 3.0) * intensity;
        g.lineStyle(lineW, col, alpha);
        g.lineBetween(x0, y, x1, y);
      }

      // 흐르는 반짝 도트 — 트레일을 따라 좌측으로 흘러감
      for (let d = 0; d < 3; d++) {
        const flow = (t * (1.5 + li * 0.3) + d * 0.33) % 1; // 0→1 반복
        const dx = baseX - flow * maxLen;
        const dy = baseY + Math.sin(t * 12 + d + phase) * 1.5;
        const da = (1 - flow) * 0.8 * intensity * flicker;
        g.fillStyle(0xffffff, da);
        g.fillCircle(dx, dy, (1.2 + (1 - flow) * 1.6) * intensity);
      }
    }

    // 바이크 바로 뒤 코어 글로우 — 강한 시안 점
    const coreA = 0.6 * intensity * (0.5 + 0.5 * Math.sin(t * 18));
    g.fillStyle(0xcaffff, coreA);
    g.fillCircle(baseX - 6, playerScreenY - PLAYER_ART_H * 0.35, 3 * intensity);
  }

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
      // ★ 불 에셋(barrel·code-flame)만 연기/베이스 글로우 렌더. 그외(잔해·자판기·벽돌 등)는
      //   "에셋 위 연기"가 어색하다는 피드백으로 제거 — 정적인 잔해에 연기가 안 붙게 한다.
      if (!p.fire) continue;
      const sx = toScreenX(o.x);
      const topY = GROUND_Y_PX - o.h * OBSTACLE_ART_SCALE; // 시각 꼭대기에서 발생

      // 일렁이는 베이스 불빛 — 밑동에 깔린 글로우가 맥동(역동성). 연기 뒤(=장애물 뒤) 레이어.
      const pulse = 0.55 + 0.45 * Math.sin(t * (p.fire ? 7 : 3) + i * 1.7);
      const baseR = o.h * 0.55;
      g.fillStyle(p.glow, 0.1 * pulse);
      g.fillCircle(sx, GROUND_Y_PX - 6, baseR * (0.85 + 0.3 * pulse));
      g.fillStyle(p.glow, 0.16 * pulse);
      g.fillCircle(sx, GROUND_Y_PX - 6, baseR * 0.5 * (0.85 + 0.25 * pulse));

      // (제거됨) 불 타입 상단의 깜빡이는 원형 코어 글로우 — "위에 동그란 빛"이 어색하다는
      // 피드백으로 삭제. 밑동 베이스 글로우와 불혀(drawFlameFountain)만으로 역동성 유지.

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
            p.ember && f < 0.34
              ? this.lerpColor(0xff7a3c, p.color, f / 0.34)
              : p.color;
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

    // 월드(장애물/포션/거리)의 렌더 기준 = 내 sim (구경 모드 제거됨).
    const world = s;

    // 배경 패럴랙스 (렌더 전용): worldPx = 누적 진행 픽셀 = distance(m) × UNITS_PER_METER.
    // 장애물 스크롤과 같은 기준이라 깊이감이 일관되고, sim은 전혀 건드리지 않는다.
    const worldPx = world.distance * C.UNITS_PER_METER;
    this.bgSkylineFar.x = -((worldPx * SKYLINE_PARALLAX) % DESIGN_W);

    // 원경 이미지 TileSprite: 시차 0.3× 스크롤 (코드 스카이라인 0.15×보다 약간 빠름 → 깊이감)
    const bgScrollX = worldPx * 0.3;
    this.bgBuildingsTile.setTilePosition(bgScrollX, 0);
    this.bgBridgesTile.setTilePosition(bgScrollX, 0);
    this.bgBridgesCurvedTile.setTilePosition(bgScrollX, 0);

    // 점프 배경 연동: 플레이어가 올라가면 배경 레이어들이 살짝 내려가 카메라가 따라가는 느낌.
    // player.y는 sim 단위(지면=0, 위=양수, 최대≈376). 읽기 전용 → 결정론 무관.
    const jumpY = s.player.y * 0.07; // 최대 ≈26px. 과하면 멀미 — 작게 시작.
    this.bgSkylineFar.y = jumpY * 0.5; // 원경: 절반
    this.sunGraphics.y = 214 + jumpY * 0.3; // 태양: 약하게 점프 연동
    // 태양 재드로우(블룸+스캔라인)는 CPU 비용이 커 ≈10fps로 스로틀 —
    // 일렁임 주파수가 낮아 체감 차이 없음. 위치(y) 추적은 매 프레임 유지.
    if (this.sunRedrawAccMs >= 100) {
      this.sunRedrawAccMs = 0;
      this.updateCodeSun();
    }
    // 별 twinkle — ≈10fps면 충분히 부드러움
    if (this.starRedrawAccMs >= 100) {
      this.starRedrawAccMs = 0;
      this.drawStars();
    }
    // 화염·연기·메테오·트레일: 매 프레임 clear/redraw는 저사양 버벅임의 주원인 → ≈20fps
    const redrawFx = this.fxRedrawAccMs >= 50;
    if (redrawFx) this.fxRedrawAccMs = 0;

    // ── 바이옴 전환 (1000m마다 팔레트 순환, 렌더 전용) + 마일스톤 팡파레 ──
    const km = Math.floor(world.distance / BIOME_METERS);
    const targetBiome = km % BIOMES.length;
    if (targetBiome !== this.biomeTo) {
      this.biomeFrom = this.biomeTo;
      this.biomeTo = targetBiome;
      this.biomeMix = 0;
    }
    if (!s.gameOver && km > this.lastKmMilestone) {
      this.lastKmMilestone = km;
      // 중앙 ⚡ NM 팡파레는 제거 — 우측 하단 응원 토스트만 유지
      this.showMilestoneCheer(km * BIOME_METERS);
    }
    let pal = BIOMES[this.biomeTo]!;
    if (this.biomeMix < 1) {
      this.biomeMix = Math.min(
        1,
        this.biomeMix + (this.renderTimeMs - this.biomeLastMs) / BIOME_FADE_MS,
      );
      pal = blendBiome(BIOMES[this.biomeFrom]!, BIOMES[this.biomeTo]!, this.biomeMix);
      this.drawSky(pal); // 크로스페이드 중에만 재드로우
    }
    this.biomeLastMs = this.renderTimeMs;

    // 바이옴별 원경 bg 타일 — biomeMix로 크로스페이드 (하드 스왑 "휙" 방지).
    // 0→buildings, 1→bridges-far, 2→bridges-curved 순환.
    {
      const fromIdx = this.biomeFrom % 3;
      const toIdx = this.biomeTo % 3;
      const tint = 0x6a5a85;
      const BG_A = 0.4;
      const mix = this.biomeMix; // 0=from, 1=to
      const alphaFor = (idx: number) => {
        if (fromIdx === toIdx) return idx === toIdx ? BG_A : 0;
        let a = 0;
        if (idx === fromIdx) a += BG_A * (1 - mix);
        if (idx === toIdx) a += BG_A * mix;
        return a;
      };
      this.bgBuildingsTile.setAlpha(alphaFor(0)).setTint(tint);
      this.bgBridgesTile.setAlpha(alphaFor(1)).setTint(tint);
      this.bgBridgesCurvedTile.setAlpha(alphaFor(2)).setTint(tint);
    }

    this.drawGroundGrid(worldPx, pal);
    this.updateBlackout(s);

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
    // 주인공 닉네임: 머리 위 추적. 점프 시 살짝만 더 올림(이전 JUMP_HIT 전체 높이는 과함).
    if (this.playerNickLabel) {
      const showNick =
        !s.gameOver && !this.introActive && !this.gamePaused;
      this.playerNickLabel.setVisible(showNick);
      if (showNick) {
        const jumpLift =
          this.playerRect.texture.key === "player-ride" ? 0 : 22;
        this.playerNickLabel.setPosition(
          toScreenX(C.PLAYER_X),
          toScreenY(s.player.y) - PLAYER_ART_H - 6 - jumpLift,
        );
        this.playerNickLabel.setAlpha(playerAlpha);
      }
    }
    // 말풍선: 플레이어 머리 위를 매 프레임 추적 (x는 플레이어와 동일 고정)
    if (this.bubble) {
      // 머리 위 여유를 더 둬 캐릭터와 겹침·가독성 저하 완화 (이전 -42 → -58)
      this.bubble.setY(toScreenY(s.player.y) - PLAYER_ART_H - 58);
    }
    // 네온 트레일: 바이크 뒤로 수평으로 뻗는 속도선 (렌더 전용, Tier 1-3)
    // 플레이어 화면 Y를 넘겨 점프 시 트레일도 함께 따라 올라가게 한다.
    if (redrawFx) {
      this.drawNeonTrail(s.speed, s.gameOver, toScreenY(s.player.y));
    }
    // 상태별 컷 전환: 사망 > 피격(무적) > 점프(공중) > 기본 주행
    // 점프 컷(jump1/jump2)은 각도가 아트에 구워져 있으므로 회전 없이 사용.
    const isAirborne =
      !s.gameOver && s.invincibleFrames === 0 && s.player.y > 2;
    const playerTex = s.gameOver
      ? "player-dead"
      : s.invincibleFrames > 0
        ? "player-hit"
        : isAirborne
          ? s.player.jumpsUsed >= 2
            ? "player-jump2"
            : "player-jump1"
          : "player-ride";
    if (this.playerRect.texture.key !== playerTex) {
      if (playerTex === "player-ride") {
        // 착지 — 달리기 애니 재개 + origin 원복(ride 초기값과 동일)
        this.playerRect.play("player-ride-anim");
        this.playerRect.setOrigin(PLAYER_ART_ORIGIN_X, PLAYER_ART_ORIGIN_Y);
      } else if (
        playerTex === "player-jump1" ||
        playerTex === "player-jump2" ||
        playerTex === "player-hit"
      ) {
        // [Tier B] jump1/2/hit 공통: prep에서 동일 캔버스(476px)로 구워짐.
        // 뒷바퀴 하단 fraction = PLAYER_ART_ORIGIN_Y(0.96) → ride와 동일 originY.
        this.playerRect.stop();
        this.playerRect.setTexture(playerTex);
        this.playerRect.setOrigin(0.5, PLAYER_ART_ORIGIN_Y);
      } else {
        // dead 크래시 컷 — prep-player-crash.py로 굽혀진 크래시 순간 아트.
        // origin: (0.42, 0.954) — 뒷바퀴 하단이 지면에 닿고, 폭발이 오른쪽으로 향함.
        this.playerRect.stop();
        this.playerRect.setTexture(playerTex);
        this.playerRect.setOrigin(0.42, 0.954);
      }
      // [Tier B] 렌더 크기: 배율 정규화를 prep 단계에서 구워넣었으므로 분기가 단순해짐.
      // dead: JUMP_HIT_ART_H 재사용(동일 COMMON_CANVAS_H) / jump+hit: JUMP_HIT_ART_H / ride: PLAYER_ART_H.
      const artH =
        playerTex === "player-dead"
          ? JUMP_HIT_ART_H
          : playerTex === "player-jump1" ||
              playerTex === "player-jump2" ||
              playerTex === "player-hit"
            ? JUMP_HIT_ART_H
            : PLAYER_ART_H;
      this.playerRect.setDisplaySize(
        (this.playerRect.width / this.playerRect.height) * artH,
        artH,
      );
    }
    // 점프 컷은 각도가 아트에 구워짐 → 공중에서 targetAngle = 0 고정(기울기 로직 무력화).
    // 착지·피격·사망 시에도 0° 복귀.
    let targetAngle = 0;
    if (this.playerRect.angle !== targetAngle) {
      const a = Phaser.Math.Linear(this.playerRect.angle, targetAngle, 0.2);
      this.playerRect.setAngle(
        Math.abs(a - targetAngle) < 0.5 ? targetAngle : a,
      );
    }

    // 사망 컷 페이드아웃 — 고스트와 동일 방식(트윈 1회). 결과 패널(900ms) 전에 소멸.
    // 200ms 띄운 후 580ms에 걸쳐 투명화 → ~780ms 완료, 패널과 겹치지 않음.
    if (playerTex === "player-dead" && !this.playerDeadFadeStarted) {
      this.playerDeadFadeStarted = true;
      this.tweens.killTweensOf(this.playerRect);
      this.tweens.add({
        targets: this.playerRect,
        alpha: 0,
        delay: 200,
        duration: 580,
        ease: "Quad.in",
        onComplete: () => {
          this.playerRect.setVisible(false);
        },
      });
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
      // 게임오버면 살아있는 고스트도 함께 쓰러진다(구경 모드 없이 즉시 종료).
      const shouldCollapse = g.finished || s.gameOver;
      if (!shouldCollapse) {
        // 살아있는 기록: 평소 주행. 위치 갱신 + 피버 중 숨김.
        sprite.setVisible(showGhosts);
        sprite.setX(toScreenX(C.PLAYER_X) + xOff);
        sprite.setY(toScreenY(g.sim.state.player.y));
        // 점프(공중)에는 달리기 프레임을 멈춰 고정 — 플레이어 점프 컷과 일관.
        // 임계값 2는 플레이어 점프 텍스처 전환과 동일(렌더 전용, 결정론 무관).
        const airborne = g.sim.state.player.y > 2;
        if (airborne && !sprite.anims.isPaused) sprite.anims.pause();
        else if (!airborne && sprite.anims.isPaused) sprite.anims.resume();
      } else if (state === "run") {
        // 기록 끝 or 게임오버 → 엎어짐 collapse 애니 1회 재생(전용 3프레임 에셋).
        this.ghostTumbleState[i] = "tumbling";
        sprite.setVisible(true);
        // 지면 고정: collapse 프레임은 하단 정렬이라 발/몸이 GROUND_Y_PX에 닿음.
        sprite.setX(toScreenX(C.PLAYER_X) + xOff).setY(GROUND_Y_PX);
        this.tweens.killTweensOf(sprite);
        sprite.setAngle(0);
        sprite.anims.resume(); // 점프 중 멈춰있던 anim 해제
        // 고스트 쓰러질 때 이모션: 머리 위에 짧게 말풍선 표시 (Tier 1-1)
        this.showGhostEmotion(
          toScreenX(C.PLAYER_X) + xOff,
          GROUND_Y_PX - GHOST_ART_H - 10,
        );
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

      // 순위 라벨 (#1 #2 #3): 상위 3위이고 살아있으며 피버가 아닐 때만 머리 위에 표시.
      if (i < 3) {
        const lbl = this.ghostRankLabels[i];
        if (lbl) {
          const showLabel = showGhosts && !shouldCollapse;
          if (showLabel) {
            lbl.setPosition(
              toScreenX(C.PLAYER_X) + xOff,
              toScreenY(g.sim.state.player.y) - GHOST_ART_H - 6,
            );
            lbl.setVisible(true);
          } else {
            lbl.setVisible(false);
          }
        }
      }
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
      // 스폰 순간(비활성→활성)에만 타입 배정 — 최근 2개 히스토리와 다르게(인접 중복 방지).
      if (!this.obstacleWasActive[i]) {
        const t = pickObstacleType(o.h, o.w, this.lastObstacleTypes);
        this.obstacleType[i] = t;
        // 인공물 계열만 히스토리에 기록 (불·용암은 자연 반복 허용)
        if (!t.startsWith("code-") && t !== "obs-fissure") {
          this.lastObstacleTypes.push(t);
          if (this.lastObstacleTypes.length > 2) this.lastObstacleTypes.shift();
        }
        this.obstacleWasActive[i] = true;
      }
      const key = this.obstacleType[i]!;
      const isCodeDrawn = key.startsWith("code-");
      if (isCodeDrawn) {
        // 코드 드로우 타입: image 스프라이트 숨기고 drawCodeObstacles()가 처리
        r.setVisible(false);
      } else {
        r.setVisible(true);
        if (r.texture.key !== key) r.setTexture(key);
        const smallOk = OBSTACLE_SMALL_OK.has(key);
        // 불/돌 외 인공물은 최소 높이 보장(주인공보다 크게). 불/돌은 hitbox 기반 그대로.
        let artH = o.h * OBSTACLE_ART_SCALE;
        if (!smallOk) artH = Math.max(artH, OBSTACLE_MIN_ART_H);
        const nativeAspect = r.width / r.height;
        // 종횡비 보존 균일 스케일: 우선 높이를 artH에 맞춤
        let dispH = artH;
        let dispW = artH * nativeAspect;
        // 폭 상한 초과 시 균일 축소 (높이도 같이 줄여 찌부 방지)
        //   불/돌: 히트박스 연동 좁은 상한 / 그외: 넓은 상한(작게 눌리지 않게)
        const capW = smallOk
          ? Math.min(OBSTACLE_MAX_W, o.w + OBSTACLE_OVERHANG_PX * 2)
          : OBSTACLE_BIG_MAX_W;
        if (dispW > capW) {
          const s = capW / dispW;
          dispW = capW;
          dispH = artH * s;
        }
        dispW = Math.max(OBSTACLE_MIN_W, dispW);
        const prof = smokeProfile(key);
        const flicker = prof.fire
          ? 1 + 0.05 * Math.sin(this.renderTimeMs * 0.012 + i * 2.1)
          : 1;
        r.setDisplaySize(dispW * flicker, dispH);
        r.setPosition(toScreenX(o.x), GROUND_Y_PX);
      }
    }
    if (redrawFx) {
      this.drawCodeObstacles(world);
      this.drawObstacleSmoke(world);
    }
    for (let i = 0; i < C.MAX_POTIONS; i++) {
      const p = world.potions[i]!;
      const c = this.fuelSprites[i]!;
      c.setVisible(p.active);
      if (p.active) {
        const t = this.time.now / 1000;           // 벽시계(시뮬 RNG 아님)
        const bob = Math.sin(t * 2.2 + i * 1.3) * 4; // 진폭 4px, 아이템마다 위상차
        c.setPosition(toScreenX(p.x), toScreenY(p.y) + bob);
      }
    }

    // HUD — 광택 그라데이션 HP 바. ★ 게임오버 후엔 주간 랭킹 패널을 가리므로 전부 숨긴다.
    const hpVisible = !s.gameOver;
    this.hpFill.setVisible(hpVisible);
    this.hpTrack.setVisible(hpVisible);
    this.hpFrame.setVisible(hpVisible);
    const ratio = s.hp / C.HP_MAX;
    const hpColor = ratio > 0.5 ? 0x3ef0c0 : ratio > 0.25 ? 0xf1c40f : 0xff4757;
    this.hpFill.scaleX = ratio * this.hpFillFullScale;
    this.hpFill.setTint(hpColor);
    // 우측 끝 소프트 글로우: fill 오른쪽 가장자리에 색 맞춰 이동
    this.hpGlow.x = this.hpFill.x + this.hpFill.displayWidth;
    this.hpGlow.setTint(hpColor);
    this.hpGlow.setVisible(hpVisible && ratio > 0.02);
    // 거리 HUD는 랭킹 패널(updateRankPanel)로 이전 — 별도 distText 없음

    // 좌측 콤보 띠지 — 랭킹 칩 아래. 2 이상일 때 좌→우 슬라이드 인, 끊기면 좌로 아웃.
    const showCombo = s.combo >= 2 && !s.gameOver;
    const restX = (this.comboRibbon.getData("restX") as number) ?? 0;
    const hiddenX = (this.comboRibbon.getData("hiddenX") as number) ?? -126;
    if (showCombo) {
      this.comboDisplay.setText(`${s.combo} combo`);
      this.comboDisplay.setColor(s.feverFramesLeft > 0 ? "#ffd700" : "#ffd166");
      if (!this.comboRibbonVisible) {
        this.comboRibbonVisible = true;
        this.comboRibbon.setVisible(true);
        this.comboRibbon.x = hiddenX;
        this.tweens.killTweensOf(this.comboRibbon);
        this.tweens.add({
          targets: this.comboRibbon,
          x: restX,
          duration: 280,
          ease: "Cubic.out",
        });
      } else {
        // 칩 열 startX가 바뀌면(고스트 수 변화) 좌측 정렬 유지
        if (!this.tweens.isTweening(this.comboRibbon)) {
          this.comboRibbon.x = restX;
        }
        if (s.combo > this.prevCombo) {
          this.tweens.killTweensOf(this.comboDisplay);
          this.comboDisplay.setScale(1.12);
          this.tweens.add({
            targets: this.comboDisplay,
            scaleX: 1,
            scaleY: 1,
            duration: 160,
            ease: "Back.out",
          });
        }
      }
    } else if (this.comboRibbonVisible) {
      this.comboRibbonVisible = false;
      this.tweens.killTweensOf(this.comboRibbon);
      this.tweens.add({
        targets: this.comboRibbon,
        x: hiddenX,
        duration: 220,
        ease: "Cubic.in",
        onComplete: () => this.comboRibbon.setVisible(false),
      });
    }
    this.prevCombo = s.combo;

    // 피버 스파이크 뱃지 — 우측 하단. 피버 중 표시·점멸, 종료 시 숨김.
    {
      const showFever = s.feverFramesLeft > 0 && !s.gameOver;
      if (showFever) {
        if (!this.feverBadgeVisible) {
          this.feverBadgeVisible = true;
          this.feverBadge.setVisible(true).setAlpha(1);
        }
        // 알람형 점멸 (WARNING과 동일 리듬)
        this.feverBadge.setAlpha(
          0.35 + 0.65 * Math.abs(Math.sin(this.renderTimeMs * 0.02)),
        );
      } else if (this.feverBadgeVisible) {
        this.feverBadgeVisible = false;
        this.feverBadge.setVisible(false).setAlpha(1);
      }
    }

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
    if (redrawFx) this.drawCodeMeteor();

    // infiniteJumpText는 제거됨, 아무것도 안 함

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
      .text(x, y, msg, {
        fontSize: "20px",
        color,
        fontStyle: "bold",
        resolution: TXT_RES,
      })
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

  /**
   * 스파이크 뱃지 — warn-bubble 에셋과 동일 실루엣.
   * 둥근 캡슐 본체 + 상하 각 2개·좌우 각 1개(총 6) 삼각 스파이크 + 네온 글로우.
   * Graphics 벡터라 축소 AA 자글거림 없음. origin = 우하단.
   */
  private makeSpikeBadge(
    label: string,
    opt: { neon: number; fill: number; text: number; w: number; h: number },
  ): Phaser.GameObjects.Container {
    const { neon, fill, text, w, h } = opt;
    const gfx = this.add.graphics();
    // 로컬 좌표: 우하단(0,0) 기준, 뱃지는 왼쪽·위쪽(-w,-h)에 그림
    const x0 = -w;
    const y0 = -h;
    const r = h * 0.48; // 캡슐 라운드
    const spike = Math.round(h * 0.28); // 스파이크 돌출

    // 외곽 경로: 캡슐 + 6스파이크 (시계방향, 좌상단 근처에서 시작)
    // 상단 스파이크 x = 1/3, 2/3 / 하단 동일 / 좌·우 중앙
    const topY = y0;
    const botY = y0 + h;
    const leftX = x0;
    const rightX = x0 + w;
    const midY = y0 + h / 2;
    const sx1 = x0 + w * 0.33;
    const sx2 = x0 + w * 0.67;

    const buildPath = (g: Phaser.GameObjects.Graphics, pad: number) => {
      // pad>0 이면 바깥으로 팽창(글로우 레이어용)
      const L = leftX - pad;
      const R = rightX + pad;
      const T = topY - pad;
      const B = botY + pad;
      const rr = r + pad * 0.5;
      const sp = spike + pad;
      const mY = midY;
      const s1 = sx1;
      const s2 = sx2;
      g.beginPath();
      // 좌상단 라운드 시작 → 상단 스파이크들 → 우상단 라운드 → 우측 스파이크
      // → 우하단 라운드 → 하단 스파이크들 → 좌하단 라운드 → 좌측 스파이크 → 닫기
      g.moveTo(L + rr, T);
      // 상단 스파이크 1
      g.lineTo(s1 - sp * 0.55, T);
      g.lineTo(s1, T - sp);
      g.lineTo(s1 + sp * 0.55, T);
      // 상단 스파이크 2
      g.lineTo(s2 - sp * 0.55, T);
      g.lineTo(s2, T - sp);
      g.lineTo(s2 + sp * 0.55, T);
      g.lineTo(R - rr, T);
      // 우상단 호
      g.arc(R - rr, T + rr, rr, -Math.PI / 2, 0, false);
      // 우측 스파이크
      g.lineTo(R, mY - sp * 0.55);
      g.lineTo(R + sp, mY);
      g.lineTo(R, mY + sp * 0.55);
      g.lineTo(R, B - rr);
      // 우하단 호
      g.arc(R - rr, B - rr, rr, 0, Math.PI / 2, false);
      // 하단 스파이크 2 (우→좌)
      g.lineTo(s2 + sp * 0.55, B);
      g.lineTo(s2, B + sp);
      g.lineTo(s2 - sp * 0.55, B);
      g.lineTo(s1 + sp * 0.55, B);
      g.lineTo(s1, B + sp);
      g.lineTo(s1 - sp * 0.55, B);
      g.lineTo(L + rr, B);
      // 좌하단 호
      g.arc(L + rr, B - rr, rr, Math.PI / 2, Math.PI, false);
      // 좌측 스파이크
      g.lineTo(L, mY + sp * 0.55);
      g.lineTo(L - sp, mY);
      g.lineTo(L, mY - sp * 0.55);
      g.lineTo(L, T + rr);
      // 좌상단 호
      g.arc(L + rr, T + rr, rr, Math.PI, (Math.PI * 3) / 2, false);
      g.closePath();
    };

    // 네온 글로우 — 바깥→안 여러 겹 (Graphics는 blur 미지원)
    const glowLayers = [
      { pad: 10, a: 0.06 },
      { pad: 7, a: 0.1 },
      { pad: 4, a: 0.16 },
      { pad: 2, a: 0.28 },
    ];
    for (const gl of glowLayers) {
      gfx.fillStyle(neon, gl.a);
      buildPath(gfx, gl.pad);
      gfx.fillPath();
    }
    // 본체 다크 필
    gfx.fillStyle(fill, 0.94);
    buildPath(gfx, 0);
    gfx.fillPath();
    // 네온 스트로크 (두껍게 → 가독·에셋 톤)
    gfx.lineStyle(3.5, neon, 0.95);
    buildPath(gfx, 0);
    gfx.strokePath();
    // 안쪽 하이라이트 림
    gfx.lineStyle(1.4, 0xffffff, 0.28);
    buildPath(gfx, 0);
    gfx.strokePath();

    const hex = `#${text.toString(16).padStart(6, "0")}`;
    const fontPx = label.length > 6 ? 22 : 26;
    const txt = this.add
      .text(x0 + w / 2, y0 + h / 2, label, {
        fontSize: `${fontPx}px`,
        fontFamily: FONT_HUD,
        fontStyle: "bold",
        color: hex,
        resolution: TXT_RES,
      })
      .setOrigin(0.5)
      .setStroke("#0a0018", 5)
      .setShadow(0, 0, `#${neon.toString(16).padStart(6, "0")}`, 8, true, true);

    return this.add.container(0, 0, [gfx, txt]).setDepth(36);
  }

  /** 포션 획득 — HP바 좌상단에 작은 "HP+" 토스트 (네온 민트) */
  private showHpPlusToast(): void {
    const txt = this.add
      .text(this.hpBarLeftX + 6, this.hpBarTopY - 4, "HP+", {
        fontSize: "13px",
        fontFamily: FONT_HUD,
        fontStyle: "bold",
        color: "#3ef0c0",
        resolution: TXT_RES,
      })
      .setOrigin(0, 1)
      .setStroke("#0a0018", 3)
      .setDepth(37)
      .setAlpha(0);
    this.tweens.add({
      targets: txt,
      alpha: 1,
      y: this.hpBarTopY - 14,
      duration: 180,
      ease: "Cubic.out",
    });
    this.tweens.add({
      targets: txt,
      alpha: 0,
      y: this.hpBarTopY - 28,
      delay: 700,
      duration: 320,
      ease: "Cubic.in",
      onComplete: () => txt.destroy(),
    });
  }

  /**
   * 오글거리는 랜덤 말풍선 — 검은 사각 박스 + 흰 글씨, 주인공 위에 잠깐 떠올랐다 사라짐.
   * 렌더 전용(sim 무관). {n}은 현재 고스트 수로 치환.
   */
  /**
   * 고스트가 쓰러지는 순간 머리 위에 짧은 이모션 말풍선 표시 (Tier 1-1).
   * 렌더 전용 — 결정론 무관.
   */
  private showGhostEmotion(x: number, y: number): void {
    const phrases = [
      "으아아아!",
      "나는 여기까지다...",
      "먼저 갈게!",
      "잠깐... 아니 잠깐만!",
      "이럴 수가!!",
    ];
    const msg = phrases[Math.floor(Math.random() * phrases.length)]!;
    const label = this.add
      .text(0, 0, msg, {
        fontSize: "11px",
        color: "#ffffff",
        align: "center",
        resolution: TXT_RES,
      })
      .setOrigin(0.5);
    const padX = 8;
    const padY = 5;
    const w = label.width + padX * 2;
    const h = label.height + padY * 2;
    const box = this.add.graphics();
    box.fillStyle(0x1a0030, 0.82);
    box.fillRoundedRect(-w / 2, -h / 2, w, h, 3);
    box.fillTriangle(-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 7);
    const c = this.add.container(x, y, [box, label]).setDepth(48).setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 150, ease: "Quad.out" });
    this.tweens.add({
      targets: c,
      alpha: 0,
      y: y - 18,
      delay: 1200,
      duration: 400,
      ease: "Quad.in",
      onComplete: () => c.destroy(),
    });
  }

  private showSpeechBubble(): void {
    if (this.bubble) {
      this.bubble.destroy();
      this.bubble = undefined;
    }
    const n = this.ghosts.length;
    const lines = [
      `${n}명의 러너가 달려온 이 길,\n그 끝은 내가 맺는다`,
      "너와 함께라면\n지구 끝까지라도 달릴 수 있어!",
      "이 별의 마지막 빛까지\n내가 지켜낼 거야",
      "두려움도 함께 달리면\n용기가 되는 법이지",
      "밤이 깊을수록\n내 질주는 더 빛난다",
      "여기서 멈추기엔\n우리의 이야기가 너무 찬란해",
      "재가 된 세상에도\n내일은 반드시 온다",
      "심장이 뛰는 한,\n나는 계속 나아간다!",
      "전설은 포기하지 않는 자의 것!",
      "이 질주의 끝에서\n새로운 새벽을 만나자",
    ];
    const msg = lines[Math.floor(Math.random() * lines.length)]!;

    const label = this.add
      .text(0, 0, msg, {
        fontSize: "13px",
        fontFamily: FONT_KR,
        color: "#ffffff",
        align: "center",
        lineSpacing: 4,
        // devicePixelRatio 해상도로 텍스처 렌더 → 레티나에서 흐릿함 방지
        resolution: TXT_RES,
      })
      .setOrigin(0.5);
    const padX = 9;
    const padY = 6;
    const w = label.width + padX * 2;
    const h = label.height + padY * 2;
    const box = this.add.graphics();
    // 외곽선 없이 검은 배경만
    box.fillStyle(0x000000, 0.78);
    box.fillRoundedRect(-w / 2, -h / 2, w, h, 3);
    // 꼬리(아래 중앙)
    box.fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 8);

    // 초기 위치는 syncVisuals에서 매 프레임 갱신하므로 0,0으로 시작
    const c = this.add
      .container(toScreenX(C.PLAYER_X), 0, [box, label])
      .setDepth(50)
      .setAlpha(0);
    this.bubble = c;
    // Y는 syncVisuals가 추적 — 트윈은 alpha만 담당
    this.tweens.add({ targets: c, alpha: 1, duration: 200, ease: "Quad.out" });
    this.tweens.add({
      targets: c,
      alpha: 0,
      delay: 4200,
      duration: 450,
      ease: "Quad.in",
      onComplete: () => {
        c.destroy();
        if (this.bubble === c) this.bubble = undefined;
      },
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
    const size = 14 + Math.random() * 26; // 본체 반지름(최종) 14~40px — 큰 것 더 다이나믹하게
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

    return {
      startX,
      startY,
      endX,
      endY,
      elapsed: 0,
      duration,
      size,
      tailAngle,
    };
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

  private drawOneMeteor(g: Phaser.GameObjects.Graphics, m: CodeMeteor): void {
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

    // ─── 1) 화염 꼬리 플룸 — 불혀 다발(가닥 수↓로 60fps 예산 확보) ───
    const tongues = 6;
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
      const halfW = Math.max(0.5, r * (0.42 - cd * 0.26)) * (0.6 + 0.4 * flick);
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
    for (let i = 0; i < 3; i++) {
      // 흔들리는 외곽 블롭
      const a2 = (i / 3) * Math.PI * 2 + t * 2;
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

    // ─── 3) 튀는 불티(ember) — 더 많이·다양하게, 꼬리 방향으로 흩뿌려진다 ───
    for (let i = 0; i < 11; i++) {
      const ph = t * (3 + i * 0.5) + i * 2.1;
      const ed = (ph % 2) / 2; // 0..1 수명
      const ang = m.tailAngle + Math.sin(ph * 5 + i) * 0.95;
      const dist = r * (1.0 + ed * (3.0 + (i % 3) * 1.2));
      const exx = x + Math.cos(ang) * dist,
        eyy = y + Math.sin(ang) * dist;
      const tw = 0.6 + 0.4 * Math.sin(t * 22 + i * 4); // 반짝임
      const col = i % 3 === 0 ? 0xfff2cc : i % 3 === 1 ? 0xffcc66 : 0xff7a1a;
      g.fillStyle(col, alpha * (1 - ed) * 0.85 * tw);
      g.fillCircle(exx, eyy, Math.max(0.5, r * 0.12 * (1 - ed)));
    }
    // ─── 4) 코어 주변 반짝이는 미세 스파크 — 평면감 완화용 ───
    for (let i = 0; i < 6; i++) {
      const ap = t * 1.7 + (i / 6) * Math.PI * 2;
      const rad = r * (1.3 + 0.5 * Math.sin(t * 3 + i * 2));
      const px = x + Math.cos(ap) * rad,
        py = y + Math.sin(ap) * rad;
      const tw = 0.5 + 0.5 * Math.sin(t * 30 + i * 7);
      g.fillStyle(0xffe7a0, alpha * 0.7 * tw);
      g.fillCircle(px, py, 0.8 + tw * 0.8);
    }
  }

  // ─── #11 가로형 랭킹 패널 ────────────────────────────────────────────────────
  // panel[0]=플레이어, panel[1..3]=상위3고스트. 순위 변화 시 컨테이너 x를 tween으로 이동.
  // 렌더 전용 — sim 읽기만, 결정론 무관.
  private updateRankPanel(): void {
    const s = this.sim.state;
    const n = Math.min(3, this.ghosts.length); // 활성 고스트 패널 수 (0~3)
    const total = n + 1; // 전체 패널 수 (고스트 + 플레이어)

    // 고스트 없거나 게임오버: 패널 숨김 (게임오버 시 주간 패널을 덮지 않게)
    if (n === 0 || s.gameOver) {
      for (const p of this.rankPanels) p.setVisible(false);
      this.rankHudLabel.setVisible(false);
      return;
    }
    this.rankHudLabel.setVisible(true);

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
    // 라벨만 칩 열 왼쪽 여백에 맞춤 (콤보 띠지는 화면 왼쪽 끝 고정)
    this.rankHudLabel.setX(startX);
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

    // 텍스트 갱신: 고스트 닉네임 + 최종거리 + 현재 슬롯(순위) 표시.
    // 고스트는 전부 '경쟁자'(봇 or 타 유저) — 닉네임은 cacheTop3FromRecords에서 캐시
    // (meta.nickname 우선). 슬롯0(실시간 플레이어)만 YOU.
    // 칩 폭이 좁아 긴 닉은 잘라 "-55 4673"이 붙어 보이지 않게.
    for (let g = 0; g < n; g++) {
      const dist = Math.floor(this.top3GhostDists[g] ?? 0);
      const gSlot = slotOfPanel[g + 1] ?? g; // 현재 표시 슬롯
      const rankLabel = ["1st", "2nd", "3rd", "4th", "5th"][gSlot] ?? `${gSlot + 1}th`;
      const raw = this.top3GhostNames[g] ?? `G${g + 1}`;
      const name = this.clipNickChars(raw, 8);
      this.rankPanelTexts[g + 1]!.setText(`${rankLabel} ${name}  ${dist}m`);
    }
  }

  /**
   * 결과 패널용 닉 자르기 — 거리 열과 겹치지 않을 길이로.
   * 한글≈11px, 영숫자≈7px(11px 폰트) 근사. 말줄임표 포함.
   */
  private clipNickForPanel(nick: string): string {
    return this.clipNickToPx(nick, this.rankNameMaxPx, 11);
  }

  /** 상단 칩용 — 글자 수 기준 단순 컷. */
  private clipNickChars(nick: string, maxChars: number): string {
    if (nick.length <= maxChars) return nick;
    return nick.slice(0, Math.max(1, maxChars - 1)) + "…";
  }

  private clipNickToPx(nick: string, maxPx: number, fontSize: number): string {
    const wOf = (ch: string) =>
      /[A-Za-z0-9.,\-_]/.test(ch) ? fontSize * 0.62 : fontSize * 0.98;
    let w = 0;
    let i = 0;
    const ell = fontSize * 0.7;
    for (; i < nick.length; i++) {
      const nw = wOf(nick[i]!);
      if (w + nw + ell > maxPx) break;
      w += nw;
    }
    if (i >= nick.length) return nick;
    return nick.slice(0, Math.max(1, i)) + "…";
  }

  // ─── 코드로 그리는 레트로웨이브 태양 ───────────────────────────────────────
  // sunGraphics.setPosition(0, 214) 이므로 드로우 좌표 y=0 이 scene y=214 (태양 센터).
  // Math.sin 허용 구역 (렌더 전용).
  // CPU: 블룸 겹수·스캔라인 간격·페더를 줄여 ≈12fps 스로틀과 함께 버벅임 완화.
  private updateCodeSun(): void {
    const cx = DESIGN_W * 0.5;
    const r = 112;
    const t = this.renderTimeMs * 0.001;
    const g = this.sunGraphics;
    g.clear();

    // ─── 0) 외곽 블룸 헤일로 — 동심원 합성(가우시안 대체). 맥동 포함.
    const bloomPulse = 1 + 0.05 * Math.sin(t * 0.9);
    const BLOOM_LAYERS = 7;
    for (let i = BLOOM_LAYERS; i >= 1; i--) {
      const f = i / BLOOM_LAYERS; // 1(바깥)→0(안)
      const rr = r * (0.96 + 1.05 * f) * bloomPulse;
      const a = 0.07 * (1 - f) + 0.015;
      g.fillStyle(this.lerpColor(0xff9a5a, 0xff6688, f), a);
      g.fillCircle(cx, 0, rr);
    }

    // ─── 1) 디스크 본체 — 가로 스캔라인. 3px 간격 + 좌우 2단 페더(비용↓).
    const FEATHER = 5;
    for (let dy = -r; dy <= r; dy += 3) {
      const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (hw < 1) continue;
      const fy = (dy + r) / (2 * r);
      const color = this.sunGradientColor(fy);
      const coreW = hw * 2 - FEATHER * 2;
      if (coreW > 0) {
        g.fillStyle(color, 1);
        g.fillRect(cx - hw + FEATHER, dy, coreW, 3.2);
      }
      // 좌우 2단 페더만 — 픽셀 루프 제거
      g.fillStyle(color, 0.45);
      g.fillRect(cx - hw, dy, FEATHER, 3.2);
      g.fillRect(cx + hw - FEATHER, dy, FEATHER, 3.2);
      g.fillStyle(color, 0.18);
      g.fillRect(cx - hw - 2, dy, 2.5, 3.2);
      g.fillRect(cx + hw - 0.5, dy, 2.5, 3.2);
    }

    // ─── 1b) 중심 코어 광채
    for (let i = 3; i >= 1; i--) {
      const f = i / 3;
      g.fillStyle(0xfff2d8, 0.07 * (1 - f) + 0.03);
      g.fillCircle(cx, -r * 0.12, r * (0.3 + 0.55 * f));
    }

    // 레트로웨이브 줄무늬 (하단 절반, 원근 압축 + 일렁임)
    const stripeCount = 8;
    for (let i = 0; i < stripeCount; i++) {
      const frac = (i + 1) / (stripeCount + 1);
      const baseLocal = frac * frac * r * 0.97;
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
    // 상단: 진한 오렌지 → 중간: 크림 → 하단: 분홍.
    // 그라데이션 밴드가 세로로 천천히 흘러가며(scroll) + 미세 일렁임 → "움직이는 그라데이션".
    const t = this.renderTimeMs * 0.001;
    const scroll = ((t * 0.12) % 1 + 1) % 1; // 느린 세로 스크롤 (한 바퀴 ≈8.3초)
    const wobble = 0.035 * Math.sin(t * 0.85 + fy * 5.0);
    const u = Math.max(0, Math.min(1, (fy + scroll + wobble) % 1));
    // 팔레트 색온도도 느리게 시프트
    const warmShift = 0.5 + 0.5 * Math.sin(t * 0.4);
    const cTop = this.lerpColor(0xff6020, 0xff8a40, warmShift);
    const cMid = this.lerpColor(0xffb060, 0xffd090, warmShift);
    const cCream = this.lerpColor(0xffe8c0, 0xfff4dc, warmShift);
    const cBot = this.lerpColor(0xff80a8, 0xffa0c0, 1 - warmShift);
    // 4스톱을 원형으로 보간해 스크롤이 끊기지 않게
    if (u < 0.25) return this.lerpColor(cTop, cMid, u / 0.25);
    if (u < 0.5) return this.lerpColor(cMid, cCream, (u - 0.25) / 0.25);
    if (u < 0.75) return this.lerpColor(cCream, cBot, (u - 0.5) / 0.25);
    return this.lerpColor(cBot, cTop, (u - 0.75) / 0.25);
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
