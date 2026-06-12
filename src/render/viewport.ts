// 시뮬 좌표 → 화면 픽셀 매핑 (단일 변환 지점).
//
//   시뮬: 지면 = 0, 위가 양수          화면: 좌상단 = (0,0), 아래가 양수
//
//        ▲ y                            ┌────────────► x
//        │   ●(점프 중)                  │   ●
//   ─────┴─────── y=0 (지면)            │ ──────────── y=GROUND_Y_PX
//                                       ▼ y
//
// Phaser Scale.FIT가 물리 해상도를 알아서 맞추므로, 논리 좌표계는 항상
// DESIGN_W × DESIGN_H 고정 — 변환은 순수 함수로 충분하다.
import { WORLD_WIDTH } from '../sim/constants';

export const DESIGN_W = WORLD_WIDTH; // 시뮬 월드 폭과 1:1 → x 변환은 항등
export const DESIGN_H = 480;
export const GROUND_Y_PX = 432; // 지면 선의 화면 y (아래 48px는 바닥 띠)

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
