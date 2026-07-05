// 로컬 익명 신원 — user_id(UUID) + 랜덤 닉네임.
//
// 주간 랭킹의 "누구" 축. 계정 시스템 없이 localStorage로 시작하고,
// 추후 슈퍼앱(토스) 사용자 식별키로 치환할 수 있게 이 모듈 뒤로 격리한다.
// 렌더/메타 레이어 전용 — sim 결정론에 절대 닿지 않는다 (Math.random 허용).
import type { KVStore } from './ghostStore';

const USER_ID_KEY = 'ga:user-id';
const NICKNAME_KEY = 'ga:nickname';

// 세기말 노을 세계관 어휘 — 짧게(UI 랭킹 행 폭 제약), 조합 수 16×16×90 ≈ 23k
const NICK_ADJ = [
  '네온', '시안', '마젠타', '심야', '광속', '새벽', '유령', '황금',
  '전기', '홀로', '레이저', '크롬', '재빠른', '불꽃', '그림자', '폭주',
] as const;
const NICK_NOUN = [
  '라이더', '여우', '고양이', '늑대', '까마귀', '토끼', '매', '표범',
  '나비', '상어', '용', '올빼미', '살쾡이', '박쥐', '벌새', '수리',
] as const;

function randomNickname(): string {
  const adj = NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)]!;
  const noun = NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)]!;
  const num = 10 + Math.floor(Math.random() * 90); // 10–99, 중복 완화
  return `${adj}${noun}-${num}`;
}

function randomUuid(): string {
  // crypto.randomUUID는 secure context 전용 — 구형 WebView 폴백 포함
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

/** 영속 익명 user_id. 최초 호출 시 생성·저장, 이후 동일 값. 스토리지 차단 시 세션 한정 값. */
export function getUserId(store: KVStore): string {
  try {
    const existing = store.getItem(USER_ID_KEY);
    if (existing) return existing;
    const fresh = randomUuid();
    store.setItem(USER_ID_KEY, fresh);
    return fresh;
  } catch {
    return sessionFallbackId;
  }
}

/** 영속 랜덤 닉네임. 최초 호출 시 생성·저장. (수동 설정 기능은 추후 — setNickname 참조) */
export function getNickname(store: KVStore): string {
  try {
    const existing = store.getItem(NICKNAME_KEY);
    if (existing) return existing;
    const fresh = randomNickname();
    store.setItem(NICKNAME_KEY, fresh);
    return fresh;
  } catch {
    return sessionFallbackNick;
  }
}

/** 닉네임 수동 변경 훅 — UI는 추후. 랭킹 meta에 다음 판부터 반영된다. */
export function setNickname(store: KVStore, nickname: string): void {
  const trimmed = nickname.trim().slice(0, 12);
  if (!trimmed) return;
  try {
    store.setItem(NICKNAME_KEY, trimmed);
  } catch {
    /* 스토리지 차단 — 무시 */
  }
}

// 스토리지 차단 환경(사파리 프라이빗 등)에서도 한 세션 안에서는 일관된 신원 유지
const sessionFallbackId = randomUuid();
const sessionFallbackNick = randomNickname();
