// 입력 로그 스키마 — 기록과 재생이 공유하는 단일 모듈.
// 고스트/리플레이의 본질: 시드 + 버전 + (프레임, 입력) 목록만 있으면
// 결정론 코어가 게임 전체를 복원한다.
//
// SIM_VERSION은 시뮬 로직이 바뀔 때마다 올린다. 버전이 다른 로그는 재생을
// 거부한다 — 밸런스 패치 후 옛 로그를 재생하면 다른 결과가 나오기 때문
// (TODOS의 "밸런스 패치 무효화" 결정과 직결).
// 0.2.0: MAX_JUMPS 2→3 (점프 역학 변경 = 옛 로그 재생 결과가 달라짐 → 버전 격리)
// 0.3.0: 피버 타임 — 피버 중 무한 점프, 옛 로그의 '막혔던 탭'이 이제 처리될 수 있어 궤적이 달라짐
// 0.4.0: 피버 중 HP 드레인 동결 + feverLevel 누적 발동 (combo 미소비)
// 0.5.0: 피버 중 3배속 (HP 드레인 복원) — 속도 변화로 궤적이 달라짐
// 0.6.0: 점프 천장 클램프 + 피버 중 충돌 무적 — y 궤적 및 HP 변화가 달라짐
// 0.7.0: 피버 중 자연 드레인 정지 + 탭마다 HP 회복 (FEVER_TAP_HEAL) — HP 궤적이 달라짐
// 0.8.0: 피버 종료 후 2초 충돌 유예 (feverGraceFramesLeft) — HP 궤적이 달라짐
// 0.9.0: 피버 시간 기반 발동(7초 콤보 유지) — feverLevel 제거, feverTimerFrames 추가
// 1.0.0: 피버 발동 간격 7→10초, 지속 4→3초 — 피버 타이밍 궤적 변경
// 1.1.0: 장애물 패턴 라이브러리(SINGLE/TALL/WIDE/BURST/STAIRCASE) — RNG 소비 순서 변경, 궤적 달라짐
// 1.2.0: WORLD_WIDTH 800→960, PLAYER_X 144→173 — 장애물 이동 거리·충돌 위치 변경
// 1.3.0: WORLD_WIDTH 960→1040, PLAYER_X 173→187, SPEED_BASE 290→340, SPEED_MAX 560→660, FEVER_SEC 3→2.5 — 속도·위치 궤적 변경
// 1.4.0: MAX_JUMPS 3→2, INTERVAL_BASE 1500→1700, INTERVAL_RAMP 28→22, PATTERN 온보딩 램프 — 점프·간격·패턴 궤적 변경
// 1.5.0: nearMissCombo 필드 제거, EV_NEAR_MISS 제거 — SimState 직렬화 구조 변경
// 1.6.0: INTERVAL_BASE 1700→2000, INTERVAL_MIN 620→750, INTERVAL_RAMP 22→14 — 간격 에스컬레이션 곡선 변경
export const SIM_VERSION = '1.6.0';

export interface InputEvent {
  frame: number;
  type: 'tap';
}

export interface InputLog {
  version: string;
  seed: number;
  events: InputEvent[];
}

/**
 * 버전 불일치 전용 에러 — "밸런스 패치 후 옛 로그 거부"는 정상 동작이므로,
 * 저장소 손상 같은 진짜 오류와 구분해 Sentry 노이즈에서 제외하기 위한 타입.
 */
export class SimVersionMismatchError extends Error {
  constructor(public readonly found: unknown) {
    super(`입력 로그 version 불일치: ${String(found)} (현재 ${SIM_VERSION})`);
    this.name = 'SimVersionMismatchError';
  }
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
    throw new SimVersionMismatchError(obj.version);
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
