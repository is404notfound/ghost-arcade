-- ghost_runs: 크로스유저 고스트 로그 저장소
--
-- 버전 파티션: 모든 쿼리에 sim_version 포함 → v1/v2 클라이언트가 절대 섞이지 않는다.
-- B5: 서버는 dumb store — log 컬럼은 읽고 쓸 뿐, 서버에서 시뮬레이션 실행 금지.
-- is_bot 플래그: 콜드스타트 봇 로그와 실제 유저 로그를 같은 테이블에서 구분.
-- 전방 설계 슬롯(character_id 등)은 NOT NULL DEFAULT로 추후 마이그레이션을 단순하게.

CREATE TABLE IF NOT EXISTS ghost_runs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  seed         BIGINT      NOT NULL,
  sim_version  TEXT        NOT NULL,
  distance     REAL        NOT NULL,
  log          JSONB       NOT NULL,
  is_bot       BOOLEAN     NOT NULL DEFAULT FALSE,
  character_id TEXT        NOT NULL DEFAULT 'base',
  -- 닉네임·캐릭터 등 RunMeta 슬롯 (inputLog.ts DEFAULT_META 참조). NULL 허용 — 클라가 관대하게 처리.
  meta         JSONB,
  -- 익명 유저 식별자 (클라 localStorage UUID, src/identity.ts). 주간 랭킹의 "누구" 축.
  user_id      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 리더보드 정렬용 복합 인덱스: (seed, sim_version, distance DESC)
-- "오늘 시드 + 현재 버전의 상위 N개" 쿼리를 Index-Only Scan으로 처리한다.
CREATE INDEX IF NOT EXISTS idx_ghost_runs_leaderboard
  ON ghost_runs (seed, sim_version, distance DESC);

-- 주간 집계 스캔용 부분 인덱스 (migrations/002)
CREATE INDEX IF NOT EXISTS idx_ghost_runs_weekly
  ON ghost_runs (created_at) WHERE is_bot = FALSE;

-- 원격 킬스위치 (migrations/003) — 재검수 없이 조정하는 기능 플래그. 클라는 읽기만.
CREATE TABLE IF NOT EXISTS remote_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostHog 이중화 미러 (migrations/003) — game_start·abnormal_exit 최소 이벤트.
CREATE TABLE IF NOT EXISTS event_mirror (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event      TEXT        NOT NULL,
  user_id    TEXT,
  props      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_mirror_event_time
  ON event_mirror (event, created_at);

-- 주간 누적 랭킹 뷰 (migrations/002) — 지난 7일 누적 거리, 봇 제외, 버전 무관(플레이 총량 지표).
-- 닉네임은 가장 최근 판의 meta->>'nickname'.
CREATE OR REPLACE VIEW ghost_weekly_rankings AS
SELECT
  user_id,
  (ARRAY_AGG(meta->>'nickname' ORDER BY created_at DESC))[1] AS nickname,
  SUM(distance)  AS total_distance,
  MAX(distance)  AS best_distance,
  COUNT(*)       AS run_count
FROM ghost_runs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND is_bot = FALSE
  AND user_id IS NOT NULL
GROUP BY user_id;
