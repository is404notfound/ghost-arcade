// 고스트 영속화 — "그날 시드의 최고 거리 1건"만 보관한다.
// 키에 SIM_VERSION이 들어가므로 밸런스 패치(버전 업) 시 옛 고스트는 자연히
// 보이지 않게 된다 — parseLog의 버전 검사가 이중 방어.
//
// localStorage를 직접 잡지 않고 KVStore로 주입받는다: 헤드리스 테스트 +
// PLAN의 "localStorage 실패 시 폴백" 요구(추후 메모리 구현 교체)에 대비.
import { SIM_VERSION, parseLog, serializeLog, type InputLog } from './sim/inputLog';

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GhostRecord {
  distance: number;
  log: InputLog;
}

export function ghostKey(seed: number): string {
  return `ga:ghost:v${SIM_VERSION}:${seed}`;
}

/** 저장된 거리보다 길 때만 덮어쓴다. 저장했으면 true. storage 예외는 삼킨다. */
export function saveIfBest(store: KVStore, seed: number, log: InputLog, distance: number): boolean {
  const existing = loadBest(store, seed);
  if (existing !== null && existing.distance >= distance) return false;
  try {
    store.setItem(ghostKey(seed), JSON.stringify({ distance, log: serializeLog(log) }));
    return true;
  } catch {
    return false; // 용량 초과/프라이빗 모드 — 기록만 못 남길 뿐 게임은 계속
  }
}

/** 유효한 최고 기록을 읽는다. 없거나 손상/버전·시드 불일치면 null. */
export function loadBest(store: KVStore, seed: number): GhostRecord | null {
  try {
    const raw = store.getItem(ghostKey(seed));
    if (raw === null) return null;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const obj = data as Record<string, unknown>;
    if (typeof obj.distance !== 'number' || typeof obj.log !== 'string') return null;
    const log = parseLog(obj.log); // 버전/스키마 검사는 여기서
    if (log.seed !== seed) return null; // 키-내용 시드 불일치 = 손상
    return { distance: obj.distance, log };
  } catch {
    return null;
  }
}
