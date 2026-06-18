import { describe, test, expect } from 'vitest';
import { DESIGN_W, DESIGN_H, GROUND_Y_PX, toScreenX, toScreenY, boxCenterScreenY } from '../viewport';
import * as C from '../../sim/constants';

describe('viewport — 시뮬 좌표 → 화면 픽셀 매핑', () => {
  test('디자인 해상도는 시뮬 월드 폭과 1:1이다 (x 변환 = 항등)', () => {
    expect(DESIGN_W).toBe(C.WORLD_WIDTH);
    expect(toScreenX(0)).toBe(0);
    expect(toScreenX(C.PLAYER_X)).toBe(C.PLAYER_X);
    expect(toScreenX(C.SPAWN_X)).toBe(C.SPAWN_X);
  });

  test('지면(시뮬 y=0)은 화면의 GROUND_Y_PX에 맵핑된다', () => {
    expect(toScreenY(0)).toBe(GROUND_Y_PX);
  });

  test('시뮬 y가 오를수록 화면 y는 내려간다 (축 반전, 선형)', () => {
    expect(toScreenY(100)).toBe(GROUND_Y_PX - 100);
    expect(toScreenY(250)).toBe(GROUND_Y_PX - 250);
  });

  test('박스 중심 변환: 바닥 기준 박스의 화면 중심 y', () => {
    // 지면 위 높이 h=60 장애물: 시뮬 중심 = 30 → 화면 = GROUND_Y_PX - 30
    expect(boxCenterScreenY(0, 60)).toBe(GROUND_Y_PX - 30);
    // 점프 중 플레이어: 발 y=100, 키=PLAYER_H → 중심 = 100 + PLAYER_H/2
    expect(boxCenterScreenY(100, C.PLAYER_H)).toBe(GROUND_Y_PX - (100 + C.PLAYER_H / 2));
  });

  test('최대 점프 높이가 화면 안에 들어온다 (잘림 방지)', () => {
    // 2단 점프 대략 상한: 각 점프 정점 vy²/2g 의 2배 + 키
    const apex = (C.JUMP_VEL * C.JUMP_VEL) / (2 * C.GRAVITY);
    const maxTop = 2 * apex + C.PLAYER_H;
    expect(toScreenY(maxTop)).toBeGreaterThanOrEqual(0);
    expect(GROUND_Y_PX).toBeLessThan(DESIGN_H);
  });
});
