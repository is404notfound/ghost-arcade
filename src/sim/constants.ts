// 시뮬 튜닝 상수 — 전부 여기서만 조정한다.
// 단위: 거리 = 시뮬 유닛(px 상당), 시간 = 초, 속도 = 유닛/초. y축은 위가 양수, 지면 = 0.

// 타임스텝
export const SIM_FPS = 60;
export const DT = 1 / SIM_FPS; // 고정 스텝 (초)

// 플레이어 (x 고정 — 월드가 왼쪽으로 흐른다, PLAYER_X ≈ WORLD_WIDTH × 0.18)
export const PLAYER_X = 187;
export const PLAYER_W = 30; // 날렵한 히트박스 (위→30)
export const PLAYER_H = 42; // (위→42)
export const JUMP_VEL = 680;
export const GRAVITY = 1400;
export const MAX_JUMPS = 2; // 지상 1단 + 공중 1단 (1.4.0에서 3→2: 타이트한 컨트롤)

// 월드 (19.5:9 비율 — DESIGN_H=480 기준 WORLD_WIDTH=1040 → 폰 가로를 채움)
export const WORLD_WIDTH = 1040;
export const SPAWN_X = WORLD_WIDTH + 30; // 화면 오른쪽 바깥
export const DESPAWN_X = -60; // 이보다 왼쪽이면 풀로 반환

// 장애물 + 에스컬레이션
export const OBS_W = 32;     // 위→32 (플레이어보다 넓어 위협감↑)
export const OBS_H_MIN = 50; // 위→50
export const OBS_H_MAX = 120; // 위→120 (싱글점프 피크 165 이하, 충분히 위협적)
export const SPEED_BASE = 340; // 유닛/초
export const SPEED_RAMP = 15; // 초당 증가량
// Phase 0 학습 #2: 속도+간격 이중 가속은 어느 순간 벽이 된다 → 상한 필수
export const SPEED_MAX = 660;
export const INTERVAL_BASE_MS = 2000; // 1.6.0: 초기 간격 확대 (온보딩 더 완화)
export const INTERVAL_MIN_MS = 750;   // 1.6.0: 최소 간격 상향 (후반 난이도 완화)
export const INTERVAL_RAMP_MS = 14;   // 1.6.0: 초당 단축량(ms) — 낮춰서 최소 간격 도달을 ~89초로 지연

// 체력
export const HP_MAX = 100;
export const HP_DRAIN_PER_SEC = 4;
export const HIT_DAMAGE = 35;
// Phase 0 학습 #4: 무적 확대(600→900ms)로 죽음의 소용돌이 완화 (감속은 인센티브 역전이라 기각됨)
export const INVINCIBLE_MS = 900;

// 포션
export const POTION_HEAL = 30;
export const POTION_CHANCE = 0.35;
export const POTION_R = 13;
export const POTION_Y_MIN = 70; // 포션 중심 높이 범위
export const POTION_Y_MAX = 230;

// 거리 점수
export const UNITS_PER_METER = 30;

// 오브젝트 풀 크기 (제로 할당 — D6)
export const MAX_OBSTACLES = 16;
export const MAX_POTIONS = 8;

// step() 이벤트 비트마스크 — 렌더/사운드 트리거용 (할당 없는 신호 전달)
export const EV_JUMP = 1;
export const EV_HIT = 2;
export const EV_POTION = 8;
export const EV_GAME_OVER = 16;
export const EV_COMBO_BREAK = 32; // combo > 0 인 상태에서 피격 시 발화
export const EV_FEVER_START = 64; // 피버 발동 순간
export const EV_FEVER_END = 128; // 피버 만료 순간

// 피버 — 일정 콤보 달성 시 무한 점프 + 2.5배속
export const FEVER_COMBO = 10; // 이 콤보에 도달하면 피버 발동
export const FEVER_SEC = 2.5; // 피버 지속 시간 (초)
export const FEVER_SPEED_MULT = 2.5; // 피버 중 스크롤 배속

// 플레이어 y 천장 — 화면 상단에서 14px 여백 (GROUND_Y_PX(432) - PLAYER_Y_MAX(376) - PLAYER_H(42) = 14)
export const PLAYER_Y_MAX = 376;

// 피버 탭 회복 — 피버 중 탭(점프)할 때마다 회복되는 HP량
export const FEVER_TAP_HEAL = 3;

// 피버 종료 후 충돌 유예 — 피버가 끝난 직후 이 시간(초)만큼 장애물 충돌 면역 유지
export const FEVER_GRACE_SEC = 2;

// 피버 시간 기반 발동 — 콤보가 이 시간(초) 이상 끊기지 않으면 피버 발동
export const FEVER_INTERVAL_SEC = 10;

// 온보딩 난이도 램프 — 경과 시간에 따라 어려운 패턴을 점진적으로 해금
export const PATTERN_RAMP_SEC = 12; // 이 시간 전: SINGLE/WIDE_LOW만 (낮고 단순)
export const PATTERN_FULL_SEC = 28; // 이 시간 이후: 전체 패턴 (STAIRCASE 포함)
