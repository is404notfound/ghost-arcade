import { describe, test, expect } from 'vitest';
import { compareGhosts, livePace, CLOSE_MARGIN_M } from '../ghostCompare';

describe('livePace — 플레이 중 최고 기록 대비 페이스', () => {
  test('최고 고스트에 못 미치면 뒤진 거리 (카운트다운)', () => {
    const p = livePace(100, 300);
    expect(p.ahead).toBe(false);
    expect(p.diffM).toBe(200);
  });

  test('최고 고스트를 넘어서면 신기록 페이스 + 앞선 거리', () => {
    const p = livePace(350, 300);
    expect(p.ahead).toBe(true);
    expect(p.diffM).toBe(50);
  });

  test('동률은 아직 신기록이 아니다 (0M 카운트다운)', () => {
    const p = livePace(300, 300);
    expect(p.ahead).toBe(false);
    expect(p.diffM).toBe(0);
  });

  test('차이는 정수 미터로 내림', () => {
    expect(livePace(100.7, 300.2).diffM).toBe(199);
    expect(Number.isInteger(livePace(123.45, 67.8).diffM)).toBe(true);
  });
});

describe('compareGhosts — 게임오버 시 고스트 경쟁 결과', () => {
  test('고스트가 없으면(첫 판) 비교 없음으로 표시한다', () => {
    const c = compareGhosts(120, []);
    expect(c.hasGhosts).toBe(false);
    expect(c.isRecord).toBe(false);
  });

  test('최고 고스트보다 멀리 가면 신기록 + 양수 차이', () => {
    const c = compareGhosts(350, [300, 200, 100]);
    expect(c.isRecord).toBe(true);
    expect(c.diffM).toBe(50);
    expect(c.bestGhostDist).toBe(300);
  });

  test('최고 고스트에 못 미치면 뒤진 거리 (양수)', () => {
    const c = compareGhosts(250, [300, 200]);
    expect(c.isRecord).toBe(false);
    expect(c.diffM).toBe(50);
  });

  test('박빙 판정: 뒤졌고 차이가 CLOSE_MARGIN_M 이내', () => {
    expect(compareGhosts(280, [300]).isClose).toBe(true); // 20M 차
    expect(compareGhosts(300 - CLOSE_MARGIN_M, [300]).isClose).toBe(true); // 경계
    expect(compareGhosts(200, [300]).isClose).toBe(false); // 100M 차
    expect(compareGhosts(350, [300]).isClose).toBe(false); // 이겼으면 박빙 아님
  });

  test('제친 고스트 수: 내 거리보다 짧은 기록 개수', () => {
    const c = compareGhosts(250, [300, 240, 200, 100]);
    expect(c.overtaken).toBe(3);
    expect(c.total).toBe(4);
  });

  test('전부 제치면 overtaken == total이고 신기록', () => {
    const c = compareGhosts(500, [300, 200]);
    expect(c.overtaken).toBe(2);
    expect(c.total).toBe(2);
    expect(c.isRecord).toBe(true);
  });

  test('차이는 정수 미터로 내림 표시용', () => {
    const c = compareGhosts(310.9, [300.2]);
    expect(Number.isInteger(c.diffM)).toBe(true);
    expect(c.diffM).toBe(10);
  });

  test('동률(같은 거리)은 신기록이 아니다', () => {
    const c = compareGhosts(300, [300]);
    expect(c.isRecord).toBe(false);
    expect(c.diffM).toBe(0);
    expect(c.isClose).toBe(true); // 0M 차이만큼 박빙
  });
});
