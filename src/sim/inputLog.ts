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
// 1.7.0: INTERVAL_BASE 2000→1800, INTERVAL_MIN 750→680, INTERVAL_RAMP 14→18 — 간격 중간 조정 (~62초)
// 1.8.0: POTION_Y_MAX 230→150 — 1단 점프 도달 범위 보정, 포션 위치 운빨 제거
// 1.10.0: 장애물 최소 간격 완화 (INTERVAL_MIN 680→980, RAMP 18→11)
// 1.11.0: 스폰 간격을 speedT(피격 리셋 시계)로 계산 — 피격 후 속도↓+간격 최소값 유지로
//         생기던 통과 불가 구간 해소. 스폰 타이밍이 달라져 궤적 변경.
// 1.12.0: INTERVAL_MIN 980→760, RAMP 11→16 — 과도하게 쉬워진 간격 재조정(난이도 복원).
// 1.13.0: FEVER_TAP_HEAL 3→1 — 피버 중 체력 회복 과도 보정.
// 1.14.0: POTION_R 13→30 — 연료통 판정을 표시 크기에 근접(수집 누락 버그) → 수집 궤적 변경.
export const SIM_VERSION = '1.14.0';

export interface InputEvent {
  frame: number;
  type: 'tap';
}

// ─── Forward-design 메타데이터 슬롯 ───────────────────────────────────────
// 닉네임·캐릭터·부스터 기능을 나중에 *버전 업 없이 가법적으로* 추가하기 위한 예약 필드.
// InputLog.meta 가 없거나 필드가 빠진 레코드 → DEFAULT_META 값으로 관대하게 처리.
// 이렇게 해두면 기능 추가 시점의 기존 고스트 레코드가 날아가지 않는다.

export interface RunMeta {
  /**
   * 캐릭터 식별자. 기본 'base'.
   * 나중에 캐릭터 선택 기능 추가 시, 그 캐릭터의 스탯으로 시뮬을 재생하려면
   * 이 필드가 로그에 박혀 있어야 한다. 없으면 'base' 스탯으로 재생.
   */
  characterId: string;
  /**
   * 플레이어 닉네임. 기본 '' (익명).
   * 크로스유저 닉네임 기능 구현 시, 랭킹·말풍선·라이벌 표시에 사용.
   */
  nickname: string;
  /**
   * 이 판에 적용된 부스터/아이템 ID 목록. 기본 [].
   * 부스터 아이템(체력 증가, 자석 포션 등) 구현 시, 로그에 기록해야
   * 시뮬 재생 시 같은 효과를 재현할 수 있다.
   */
  modifiers: string[];
}

/** meta 필드 기본값 — 없는 필드는 이 값으로 채운다. */
export const DEFAULT_META: Readonly<RunMeta> = {
  characterId: 'base',
  nickname: '',
  modifiers: [],
};

/** meta가 완전하지 않아도 기본값을 채워 RunMeta를 반환한다. */
export function resolveMeta(partial?: Partial<RunMeta>): RunMeta {
  if (!partial) return { ...DEFAULT_META };
  return {
    characterId: partial.characterId ?? DEFAULT_META.characterId,
    nickname:    partial.nickname    ?? DEFAULT_META.nickname,
    modifiers:   partial.modifiers   ?? DEFAULT_META.modifiers,
  };
}
// ─────────────────────────────────────────────────────────────────────────────

export interface InputLog {
  version: string;
  seed: number;
  events: InputEvent[];
  /**
   * 게임플레이 메타데이터 슬롯 (Forward-design).
   * 선택적 — 없거나 부분 기입인 레코드는 DEFAULT_META로 보완.
   * SIM_VERSION 업 없이 필드를 추가/확장 가능(가법적 변경 원칙).
   */
  meta?: Partial<RunMeta>;
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
  // meta 슬롯: 없거나 부분 기입이어도 허용 (Forward-design — 가법적 추가 원칙)
  const rawMeta = obj.meta as Partial<RunMeta> | undefined;
  return {
    version: obj.version,
    seed: obj.seed,
    events: obj.events as InputEvent[],
    ...(rawMeta !== undefined ? { meta: rawMeta } : {}),
  };
}
