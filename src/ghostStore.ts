// 고스트 영속화 — "그날 시드의 상위 N개 기록"을 보관한다 (멀티 셀프 고스트).
// 키에 SIM_VERSION이 들어가므로 밸런스 패치(버전 업) 시 옛 고스트는 자연히
// 보이지 않게 된다 — parseLog의 버전 검사가 레코드 단위 이중 방어.
//
// localStorage를 직접 잡지 않고 KVStore로 주입받는다: 헤드리스 테스트 +
// PLAN의 "localStorage 실패 시 폴백" 요구(추후 메모리 구현 교체)에 대비.
import * as Sentry from '@sentry/browser';
import {
  SIM_VERSION,
  SimVersionMismatchError,
  parseLog,
  serializeLog,
  type InputLog,
} from './sim/inputLog';

/** 보관/재생할 상위 기록 수 — 렌더 고스트 풀 크기와 동일 */
export const GHOST_TOP_N = 8;

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GhostRecord {
  distance: number;
  log: InputLog;
}

/**
 * 거리 내림차순 정렬된 기록 풀에서 N개를 "실력 사다리"로 뽑는다.
 * idx=0 → 최장 기록(목표로 남는 엘리트), 마지막 → 하위 발판(신규도 넘을 수 있음).
 *
 * 배경: 필드를 "거리순 상위 N개"로 채우면 항상 최고 기록만 모여, 신규 유저는
 * 구조적으로 아무도 못 이긴다(라이브 데이터: 74% 판이 0제침). 대신 풀 전체에
 * 고르게 퍼진 백분위를 뽑으면 초반 제침이 열리고, 인구가 늘수록 사다리가 자동
 * 재조정된다(렌더/데이터 레이어 — SIM_VERSION 무관).
 *
 * 하단은 최저점(즉사 fluke) 대신 ~하위 8% 지점에서 멈춰 극단값을 피한다.
 * 풀이 N 이하면 그대로 반환(사다리 만들 표본 부족 — 콜드스타트 봇 보충 대상).
 */
export function selectLadder<T>(sortedDesc: readonly T[], n: number): T[] {
  const len = sortedDesc.length;
  if (len <= n || n <= 0) return sortedDesc.slice(0, Math.max(0, n));
  const BOTTOM = 0.92; // 마지막 발판 위치 = 상단에서 92% 지점(=하위 8%), 극단 회피
  const out: T[] = [];
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * BOTTOM;
    let idx = Math.round(t * (len - 1));
    if (idx <= prev) idx = prev + 1; // 작은 풀에서 인덱스 겹침 방지(엄격 증가)
    if (idx > len - 1) idx = len - 1;
    out.push(sortedDesc[idx]!);
    prev = idx;
  }
  return out;
}

export function ghostKey(seed: number): string {
  return `ga:ghost:v${SIM_VERSION}:${seed}`;
}

/**
 * 이번 판을 상위 N에 끼워 넣는다. 들어갔으면 true, 미달이면 false.
 * storage 예외는 삼킨다 — 기록만 못 남길 뿐 게임은 계속.
 */
export function saveRun(store: KVStore, seed: number, log: InputLog, distance: number): boolean {
  const runs = loadTopRuns(store, seed);
  if (runs.length >= GHOST_TOP_N && runs[runs.length - 1]!.distance >= distance) {
    return false; // 꽉 찼고 최하위보다도 짧음
  }
  runs.push({ distance, log });
  runs.sort((a, b) => b.distance - a.distance);
  runs.length = Math.min(runs.length, GHOST_TOP_N);
  try {
    store.setItem(
      ghostKey(seed),
      JSON.stringify(runs.map((r) => ({ distance: r.distance, log: serializeLog(r.log) }))),
    );
    return true;
  } catch (e) {
    // 저장 실패(QuotaExceeded 등)는 게임을 멈추진 않지만 빈도는 알 가치가 있다
    Sentry.captureException(e, { level: 'warning' });
    return false;
  }
}

/** 유효한 상위 기록들 (거리 내림차순, 최대 N). 손상 레코드는 개별 필터링. */
export function loadTopRuns(store: KVStore, seed: number): GhostRecord[] {
  try {
    const raw = store.getItem(ghostKey(seed));
    if (raw === null) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    const runs: GhostRecord[] = [];
    for (const item of data) {
      try {
        const obj = item as Record<string, unknown>;
        if (typeof obj.distance !== 'number' || typeof obj.log !== 'string') continue;
        const log = parseLog(obj.log); // 버전/스키마 검사
        if (log.seed !== seed) continue; // 키-내용 시드 불일치 = 손상
        runs.push({ distance: obj.distance, log });
      } catch (e) {
        // 깨진 레코드 하나가 나머지를 죽이지 않는다.
        // 버전 불일치는 밸런스 패치 후 정상 동작 → 노이즈 제외, 그 외만 보고.
        if (!(e instanceof SimVersionMismatchError)) {
          Sentry.captureException(e, { level: 'warning' });
        }
      }
    }
    runs.sort((a, b) => b.distance - a.distance);
    return runs.slice(0, GHOST_TOP_N);
  } catch (e) {
    // 블롭 전체가 깨졌거나(JSON.parse 실패) storage 접근 자체가 실패한 경우
    Sentry.captureException(e, { level: 'warning' });
    return [];
  }
}
