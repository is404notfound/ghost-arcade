// 입력 로그 스키마 — 기록과 재생이 공유하는 단일 모듈.
// 고스트/리플레이의 본질: 시드 + 버전 + (프레임, 입력) 목록만 있으면
// 결정론 코어가 게임 전체를 복원한다.
//
// SIM_VERSION은 시뮬 로직이 바뀔 때마다 올린다. 버전이 다른 로그는 재생을
// 거부한다 — 밸런스 패치 후 옛 로그를 재생하면 다른 결과가 나오기 때문
// (TODOS의 "밸런스 패치 무효화" 결정과 직결).
export const SIM_VERSION = '0.1.0';

export interface InputEvent {
  frame: number;
  type: 'tap';
}

export interface InputLog {
  version: string;
  seed: number;
  events: InputEvent[];
}

export function createInputLog(seed: number): InputLog {
  return { version: SIM_VERSION, seed, events: [] };
}

export function recordTap(log: InputLog, frame: number): void {
  const last = log.events[log.events.length - 1];
  if (last !== undefined && frame < last.frame) {
    throw new Error(`입력 프레임 역행: ${last.frame} 다음에 ${frame}`);
  }
  log.events.push({ frame, type: 'tap' });
}

export function serializeLog(log: InputLog): string {
  return JSON.stringify(log);
}

export function parseLog(raw: string): InputLog {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) {
    throw new Error('입력 로그 형식 오류: 객체가 아님');
  }
  const obj = data as Record<string, unknown>;
  if (obj.version !== SIM_VERSION) {
    throw new Error(`입력 로그 version 불일치: ${String(obj.version)} (현재 ${SIM_VERSION})`);
  }
  if (typeof obj.seed !== 'number' || !Array.isArray(obj.events)) {
    throw new Error('입력 로그 형식 오류: seed/events 누락');
  }
  for (const ev of obj.events) {
    const e = ev as Record<string, unknown>;
    if (typeof e.frame !== 'number' || e.type !== 'tap') {
      throw new Error('입력 로그 형식 오류: 이벤트 스키마 위반');
    }
  }
  return { version: obj.version, seed: obj.seed, events: obj.events as InputEvent[] };
}
