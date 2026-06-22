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
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 리더보드 정렬용 복합 인덱스: (seed, sim_version, distance DESC)
-- "오늘 시드 + 현재 버전의 상위 N개" 쿼리를 Index-Only Scan으로 처리한다.
CREATE INDEX IF NOT EXISTS idx_ghost_runs_leaderboard
  ON ghost_runs (seed, sim_version, distance DESC);
