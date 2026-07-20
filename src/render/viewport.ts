// 시뮬 좌표 → 화면 픽셀 매핑 (단일 변환 지점).
//
//   시뮬: 지면 = 0, 위가 양수          화면: 좌상단 = (0,0), 아래가 양수
//
//        ▲ y                            ┌────────────► x
//        │   ●(점프 중)                  │   ●
//   ─────┴─────── y=0 (지면)            │ ──────────── y=GROUND_Y_PX
//                                       ▼ y
//
// Phaser Scale.FIT가 화면에 맞추므로, 논리 좌표계는 항상
// DESIGN_W × DESIGN_H 고정 — 변환은 순수 함수로 충분하다.
// (ENVELOP/cover는 상·하 HUD를 잘라 Today's Rank·HP바가 사라지므로 쓰지 않음.
//  기기 여백은 게임 톤 배경으로 채워 검은 레터박스를 피한다.)
import { WORLD_WIDTH } from '../sim/constants';

export const DESIGN_W = WORLD_WIDTH; // 시뮬 월드 폭과 1:1 → x 변환은 항등
export const DESIGN_H = 480;
export const GROUND_Y_PX = 432; // 지면 선의 화면 y (아래 48px는 바닥 띠)

/** 토스 게임 내비(더보기·닫기 X)가 덮는 우측 예약 폭 (논리 px) */
export const HUD_RIGHT_CLEAR = 128;
/** HUD 좌·상·하 안쪽 여백 (논리 px) — 가장자리 클리핑·홈 인디케이터 대비 */
export const HUD_LEFT_PAD = 12;
export const HUD_TOP_PAD = 8;
export const HUD_BOTTOM_PAD = 10;

export function toScreenX(simX: number): number {
  return simX;
}

export function toScreenY(simY: number): number {
  return GROUND_Y_PX - simY;
}

/** 바닥 기준으로 서 있는 박스(장애물/플레이어)의 화면 중심 y */
export function boxCenterScreenY(simBottomY: number, height: number): number {
  return toScreenY(simBottomY + height / 2);
}
