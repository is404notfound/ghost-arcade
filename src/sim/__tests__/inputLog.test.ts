import { describe, test, expect } from 'vitest';
import { SIM_VERSION, createInputLog, recordTap, serializeLog, parseLog } from '../inputLog';

describe('InputLog', () => {
  test('새 로그는 현재 시뮬 버전 태그와 시드를 담는다', () => {
    const log = createInputLog(12345);
    expect(log.version).toBe(SIM_VERSION);
    expect(log.seed).toBe(12345);
    expect(log.events).toEqual([]);
  });

  test('탭 이벤트를 프레임 인덱스와 함께 기록한다', () => {
    const log = createInputLog(1);
    recordTap(log, 10);
    recordTap(log, 25);
    expect(log.events).toEqual([
      { frame: 10, type: 'tap' },
      { frame: 25, type: 'tap' },
    ]);
  });

  test('프레임 인덱스가 역행하면 기록을 거부한다', () => {
    const log = createInputLog(1);
    recordTap(log, 10);
    expect(() => recordTap(log, 5)).toThrow();
  });

  test('같은 프레임의 중복 탭은 허용한다 (같은 스텝에 두 입력 가능)', () => {
    const log = createInputLog(1);
    recordTap(log, 10);
    expect(() => recordTap(log, 10)).not.toThrow();
  });

  test('직렬화 → 파싱 round-trip이 동일한 로그를 복원한다', () => {
    const log = createInputLog(99);
    recordTap(log, 3);
    recordTap(log, 7);
    const restored = parseLog(serializeLog(log));
    expect(restored).toEqual(log);
  });

  test('버전이 다른 로그는 파싱을 거부한다 (밸런스 패치 후 재생 오염 방지)', () => {
    const log = createInputLog(1);
    const tampered = serializeLog(log).replace(SIM_VERSION, '0.0.0-old');
    expect(() => parseLog(tampered)).toThrow(/version/i);
  });

  test('구조가 깨진 입력은 파싱을 거부한다', () => {
    expect(() => parseLog('not json')).toThrow();
    expect(() => parseLog('{"version":"' + SIM_VERSION + '"}')).toThrow(); // seed/events 누락
    expect(() =>
      parseLog(JSON.stringify({ version: SIM_VERSION, seed: 1, events: [{ frame: 'x', type: 'tap' }] })),
    ).toThrow();
  });
});
