import { describe, test, expect } from 'vitest';
import { FixedTimestep } from '../timestep';

describe('FixedTimestep', () => {
  test('누적 시간이 dt를 넘은 만큼만 스텝을 실행한다', () => {
    const ts = new FixedTimestep(10); // dt = 10ms
    let steps = 0;
    ts.update(35, () => steps++);
    expect(steps).toBe(3); // 35ms → 3스텝, 잔여 5ms
  });

  test('잔여 시간은 다음 update로 이월된다', () => {
    const ts = new FixedTimestep(10);
    let steps = 0;
    ts.update(35, () => steps++); // 3스텝, 잔여 5
    ts.update(5, () => steps++); // 5+5=10 → 1스텝
    expect(steps).toBe(4);
  });

  test('dt 미만의 경과 시간은 스텝을 실행하지 않는다', () => {
    const ts = new FixedTimestep(10);
    let steps = 0;
    ts.update(9, () => steps++);
    expect(steps).toBe(0);
  });

  test('렌더 fps와 무관하게 같은 총 시간이면 같은 스텝 수가 나온다', () => {
    // 60fps 흉내(16.67ms씩)와 30fps 흉내(33.33ms씩)로 1초씩 진행
    const a = new FixedTimestep(10);
    const b = new FixedTimestep(10);
    let stepsA = 0, stepsB = 0;
    for (let i = 0; i < 60; i++) a.update(1000 / 60, () => stepsA++);
    for (let i = 0; i < 30; i++) b.update(1000 / 30, () => stepsB++);
    expect(stepsA).toBe(stepsB);
    expect(stepsA).toBe(100); // 1000ms / 10ms
  });

  test('한 번의 update에서 maxSteps를 초과하지 않는다 (죽음의 나선 방지)', () => {
    const ts = new FixedTimestep(10, 5); // maxSteps = 5
    let steps = 0;
    ts.update(10000, () => steps++); // 탭 전환 등으로 1초 멈춘 상황
    expect(steps).toBe(5);
  });

  test('maxSteps로 잘린 뒤 누적분은 버려진다 (다음 프레임에 몰아치지 않음)', () => {
    const ts = new FixedTimestep(10, 5);
    let steps = 0;
    ts.update(10000, () => steps++);
    steps = 0;
    ts.update(10, () => steps++);
    expect(steps).toBe(1); // 정확히 1스텝 — 밀린 빚이 남아있으면 안 됨
  });
});
