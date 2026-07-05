-- 002: user_id 컬럼 + 주간 누적 랭킹 뷰 (2026-07-05)
--
-- 주간 랭킹: "지난 7일간 누적 주행 거리" 기준. 유저 식별은 클라이언트 익명
-- UUID(src/identity.ts, localStorage) — 추후 슈퍼앱 사용자 식별키로 치환 가능.
--
-- sim_version을 섞는 이유: 주간 누적은 경쟁 정밀도가 아니라 플레이 총량 지표라
-- 밸런스 패치(버전 업)로 주중 누적이 증발하면 오히려 유저 자산을 해친다.
-- 데일리 시드 고스트/리더보드는 기존대로 버전 파티션 유지 (PLAN.md B6).
--
-- 적용 방법: Supabase Dashboard > SQL Editor에 붙여넣고 Run.

ALTER TABLE ghost_runs ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 주간 집계 스캔용 부분 인덱스 — 봇 로그(콜드스타트)는 랭킹에서 제외되므로 인덱스에서도 제외
CREATE INDEX IF NOT EXISTS idx_ghost_runs_weekly
  ON ghost_runs (created_at) WHERE is_bot = FALSE;

-- 주간 누적 랭킹 뷰 — 클라는 이 뷰를 total_distance 내림차순으로 읽기만 한다.
-- 닉네임은 가장 최근 판의 meta->>'nickname' (닉 변경 시 다음 판부터 반영).
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
