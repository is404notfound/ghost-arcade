// 크로스유저 고스트 원격 저장소 — Supabase ghost_runs 테이블 어댑터.
//
// 설계 원칙 (PLAN.md B5–B6):
//   - 서버는 dumb store: log JSONB를 읽고 쓸 뿐, 시뮬레이션 실행 금지.
//   - 버전 파티션: 모든 쿼리에 SIM_VERSION 포함 → v1/v2 로그 교차 금지.
//   - 네트워크 장애 = 완전 폴백: 예외를 밖으로 절대 던지지 않는다.
//   - 이상치 필터(B3): 물리 상한 초과 거리는 서버에 기록하지 않는다.
import * as Sentry from '@sentry/browser';
import { getSupabaseClient } from './supabaseClient';
import { SIM_VERSION, parseLog, type InputLog, type RunMeta } from './sim/inputLog';
import { type GhostRecord } from './ghostStore';
import { SPEED_MAX, UNITS_PER_METER } from './sim/constants';

// 고스트 필드 풀 크기 — top-8이 아니라 "실력 사다리"(selectLadder)를 뽑을 넓은 풀을
// 가져온다. 사다리는 풀 전체에 퍼진 백분위를 골라 신규도 넘을 수 있는 하단 발판을
// 확보하는데, top-8만 받으면 전부 최고 기록이라 사다리를 만들 저거리 표본이 없다.
// 현재 시드별 일일 판 수(<수백)는 이 값으로 사실상 전량 커버. 일 볼륨이 폭증하면
// 서버측 백분위 샘플링(RPC)으로 옮겨야 한다 — 그때까지 distance 내림차순 상위 풀로 근사.
const LADDER_POOL_N = 150;

// 물리 상한: SPEED_MAX(660) / UNITS_PER_METER(30) = 22m/s × 900초(15분) ≈ 19,800m
// HP 드레인으로 실제 달성 불가능한 값 — 명백한 치트만 걸러낸다
const DISTANCE_OUTLIER_CEILING = (SPEED_MAX / UNITS_PER_METER) * 900;

// SELECT 타임아웃 — Supabase hang 시 무한 대기 방지 (로컬 폴백 보장)
const REMOTE_TIMEOUT_MS = 5000;

// ghost_runs 테이블 컬럼 타입.
// meta 컬럼은 Forward-design 슬롯 (migrations/001) — 컬럼이 없는 구 DB에서는
// missing-column 에러를 감지해 meta 없이 재시도한다 (아래 isMissingColumnError).
type DbRow = { distance: number; log: unknown; meta?: Partial<RunMeta> | null };

// PostgREST는 존재하지 않는 컬럼을 조용히 무시하지 않는다:
// select → 42703 (undefined_column), insert → PGRST204 (schema cache에 컬럼 없음).
// 이 두 코드만 "스키마가 아직 구버전" 신호로 보고 meta 없이 폴백한다.
function isMissingColumnError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  return code === '42703' || code === 'PGRST204';
}

/**
 * 오늘 시드 기준 원격 기록 풀(거리 내림차순 상위 LADDER_POOL_N)을 가져온다.
 * 호출부가 selectLadder로 사다리를 뽑거나(필드) top-N을 자름(랭킹).
 * Supabase 미설정이거나 네트워크 장애 시 [] 반환 — 호출부가 localStorage로 폴백.
 */
export async function loadTopRunsRemote(seed: number): Promise<GhostRecord[]> {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[remoteStore] Supabase 클라이언트 null — 환경변수 미설정?');
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const selectTop = (cols: string) =>
      client
        .from('ghost_runs')
        .select(cols)
        .eq('seed', seed)
        .eq('sim_version', SIM_VERSION)
        .order('distance', { ascending: false })
        .limit(LADDER_POOL_N)
        .abortSignal(controller.signal) as unknown as Promise<{
        data: DbRow[] | null;
        error: unknown;
      }>;

    let { data, error } = await selectTop('distance, log, meta');
    // meta 컬럼 미적용 DB (migrations/001 이전) — meta 없이 재시도
    if (isMissingColumnError(error)) ({ data, error } = await selectTop('distance, log'));

    clearTimeout(timer);
    if (error) throw error;
    if (!data) return [];

    const runs: GhostRecord[] = [];
    for (const row of data) {
      try {
        // JSONB → 문자열 → parseLog (스키마·버전 검증 재사용)
        const parsed = parseLog(JSON.stringify(row.log));
        if (parsed.seed !== seed) {
          console.warn('[remoteStore] 시드 불일치 스킵 — row.seed:', parsed.seed, '기대:', seed);
          continue;
        }
        // DB meta 컬럼이 있으면 log.meta에 병합 (Forward-design 슬롯)
        if (row.meta) parsed.meta = { ...row.meta, ...parsed.meta };
        runs.push({ distance: row.distance, log: parsed });
      } catch (e) {
        console.warn('[remoteStore] parseLog 스킵 —', (e as Error).message);
      }
    }
    return runs;
  } catch (e) {
    clearTimeout(timer);
    // AbortError는 의도적 타임아웃 — Sentry 노이즈 제외
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      console.error('[remoteStore] SELECT 실패 —', e);
      Sentry.captureException(e, { level: 'warning' });
    }
    return [];
  }
}

// ─── 주간 누적 랭킹 (migrations/002 뷰) ─────────────────────────────────────

/** ghost_weekly_rankings 뷰 한 행 — 지난 7일 누적. */
export interface WeeklyRank {
  user_id: string;
  nickname: string | null;
  total_distance: number;
  best_distance: number;
  run_count: number;
}

// "내 순위"를 top-N 밖에서도 찾을 수 있게 여유 있게 가져온다 (표시는 상위 5 + 나).
const WEEKLY_FETCH_N = 50;

/**
 * 주간 누적 랭킹을 total_distance 내림차순으로 가져온다.
 * 뷰 미적용(migrations/002 이전)·네트워크 장애 시 [] — 호출부는 패널을 숨기면 된다.
 */
export async function loadWeeklyRankings(): Promise<WeeklyRank[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const { data, error } = (await client
      .from('ghost_weekly_rankings')
      .select('user_id, nickname, total_distance, best_distance, run_count')
      .order('total_distance', { ascending: false })
      .limit(WEEKLY_FETCH_N)
      .abortSignal(controller.signal)) as { data: WeeklyRank[] | null; error: unknown };

    clearTimeout(timer);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    clearTimeout(timer);
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      console.warn('[remoteStore] 주간 랭킹 조회 실패 —', e);
      // 뷰 미적용(42P01: relation does not exist)은 예상 가능한 degrade — Sentry 제외
      const code = (e as { code?: unknown }).code;
      if (code !== '42P01') Sentry.captureException(e, { level: 'warning' });
    }
    return [];
  }
}

/**
 * 이번 판 결과를 원격에 제출한다. fire-and-forget: 실패해도 로컬 기록은 유지된다.
 * isBot=true 이면 콜드스타트 봇 로그로 표시된다.
 */
export async function submitRunRemote(
  seed: number,
  log: InputLog,
  distance: number,
  isBot = false,
  meta?: Partial<RunMeta>,
  userId?: string,
): Promise<void> {
  // 이상치 필터 (B3) — 물리 상한 초과·음수는 서버에 기록하지 않는다
  if (distance > DISTANCE_OUTLIER_CEILING || distance < 0) return;

  const client = getSupabaseClient();
  if (!client) return;

  // meta 슬롯: log.meta 우선, 파라미터 meta로 보완 (Forward-design)
  const mergedMeta = meta ?? log.meta ?? undefined;

  const baseRow = {
    seed,
    sim_version: SIM_VERSION,
    distance,
    log: log as unknown as Record<string, unknown>,
    is_bot: isBot,
  };
  // INSERT hang 방지 — Supabase 장애 시 무한 대기 없이 로컬 기록으로 계속
  const raceInsert = (row: Record<string, unknown>) =>
    Promise.race([
      client.from('ghost_runs').insert(row) as unknown as Promise<{ error: unknown }>,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new DOMException('INSERT timeout', 'AbortError')),
          REMOTE_TIMEOUT_MS,
        ),
      ),
    ]);

  const hasOptionalCols = Boolean(mergedMeta ?? userId);
  const fullRow = {
    ...baseRow,
    ...(mergedMeta ? { meta: mergedMeta } : {}),
    ...(userId ? { user_id: userId } : {}),
  };

  try {
    let { error } = await raceInsert(fullRow);
    // 선택 컬럼(meta/user_id) 미적용 DB (migrations/001·002 이전) —
    // 필수 컬럼만으로 재시도해 기록 자체는 살린다
    if (hasOptionalCols && isMissingColumnError(error))
      ({ error } = await raceInsert(baseRow));
    if (error) throw error;
  } catch (e) {
    // AbortError는 의도적 타임아웃 — Sentry 노이즈 제외
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      Sentry.captureException(e, { level: 'warning' });
    }
  }
}
