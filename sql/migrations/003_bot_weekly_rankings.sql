-- 003: 주간 랭킹 뷰에 봇 포함 (2026-07-07)
--
-- 이슈 4: 봇(is_bot=true)도 user_id + meta->>'nickname' 을 갖게 되어
-- ghost_weekly_rankings 뷰가 봇을 집계에서 제외할 이유가 없다.
-- 봇은 bot:tier:i (티어 고정) user_id를 가지므로 7일 누적으로 자연히 쌓여
-- 실제 유저와 같은 축에서 경쟁한다.
--
-- 변경: WHERE is_bot = FALSE → 제거(봇도 포함, user_id IS NOT NULL 조건만 유지).
-- user_id가 있는 행만 집계 → 구형 봇 제출(user_id NULL)은 자동 제외.
--
-- 적용 방법: Supabase Dashboard > SQL Editor에 붙여넣고 Run.

-- 주간 누적 랭킹 뷰 교체 — 봇(is_bot=true, user_id IS NOT NULL)도 포함
CREATE OR REPLACE VIEW ghost_weekly_rankings AS
SELECT
  user_id,
  (ARRAY_AGG(meta->>'nickname' ORDER BY created_at DESC))[1] AS nickname,
  SUM(distance)  AS total_distance,
  MAX(distance)  AS best_distance,
  COUNT(*)       AS run_count
FROM ghost_runs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND user_id IS NOT NULL
GROUP BY user_id;

-- 봇 기록 주간 집계를 위한 인덱스 — user_id·created_at 복합 (봇 포함이므로 is_bot 필터 제거)
-- 기존 idx_ghost_runs_weekly 는 is_bot=FALSE 부분 인덱스라 봇을 포함하면 full scan.
-- 새 인덱스를 생성하고 기존 인덱스는 유지(일간 랭킹 쿼리에서 여전히 활용 가능).
CREATE INDEX IF NOT EXISTS idx_ghost_runs_weekly_all
  ON ghost_runs (created_at)
  WHERE user_id IS NOT NULL;
