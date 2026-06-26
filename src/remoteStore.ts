// 크로스유저 고스트 원격 저장소 — Supabase ghost_runs 테이블 어댑터.
//
// 설계 원칙 (PLAN.md B5–B6):
//   - 서버는 dumb store: log JSONB를 읽고 쓸 뿐, 시뮬레이션 실행 금지.
//   - 버전 파티션: 모든 쿼리에 SIM_VERSION 포함 → v1/v2 로그 교차 금지.
//   - 네트워크 장애 = 완전 폴백: 예외를 밖으로 절대 던지지 않는다.
//   - 이상치 필터(B3): 물리 상한 초과 거리는 서버에 기록하지 않는다.
import * as Sentry from '@sentry/browser';
import { getSupabaseClient } from './supabaseClient';
import { SIM_VERSION, parseLog, type InputLog } from './sim/inputLog';
import { GHOST_TOP_N, type GhostRecord } from './ghostStore';
import { SPEED_MAX, UNITS_PER_METER } from './sim/constants';

// 물리 상한: SPEED_MAX(660) / UNITS_PER_METER(30) = 22m/s × 900초(15분) ≈ 19,800m
// HP 드레인으로 실제 달성 불가능한 값 — 명백한 치트만 걸러낸다
const DISTANCE_OUTLIER_CEILING = (SPEED_MAX / UNITS_PER_METER) * 900;

// SELECT 타임아웃 — Supabase hang 시 무한 대기 방지 (로컬 폴백 보장)
const REMOTE_TIMEOUT_MS = 5000;

type DbRow = { distance: number; log: unknown };

/**
 * 오늘 시드 기준 원격 상위 N 기록을 가져온다.
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
    const { data, error } = (await client
      .from('ghost_runs')
      .select('distance, log')
      .eq('seed', seed)
      .eq('sim_version', SIM_VERSION)
      .order('distance', { ascending: false })
      .limit(GHOST_TOP_N)
      .abortSignal(controller.signal)) as { data: DbRow[] | null; error: unknown };

    clearTimeout(timer);
    if (error) {
      if (error instanceof Error) throw error;
      const pgError = error as Record<string, unknown>;
      throw new Error(pgError.message ? String(pgError.message) : JSON.stringify(pgError));
    }
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

/**
 * 이번 판 결과를 원격에 제출한다. fire-and-forget: 실패해도 로컬 기록은 유지된다.
 * isBot=true 이면 콜드스타트 봇 로그로 표시된다.
 */
export async function submitRunRemote(
  seed: number,
  log: InputLog,
  distance: number,
  isBot = false,
): Promise<void> {
  // 이상치 필터 (B3) — 물리 상한 초과·음수는 서버에 기록하지 않는다
  if (distance > DISTANCE_OUTLIER_CEILING || distance < 0) return;

  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = (await client.from('ghost_runs').insert({
      seed,
      sim_version: SIM_VERSION,
      distance,
      log: log as unknown as Record<string, unknown>,
      is_bot: isBot,
    })) as { error: unknown };
    
    if (error) {
      if (error instanceof Error) throw error;
      const pgError = error as Record<string, unknown>;
      throw new Error(pgError.message ? String(pgError.message) : JSON.stringify(pgError));
    }
  } catch (e) {
    // 제출 실패 = 로컬 기록으로만 진행 — 게임을 멈추지 않는다
    Sentry.captureException(e, { level: 'warning' });
  }
}
