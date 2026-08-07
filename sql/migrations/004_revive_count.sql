-- 004: revive_count 컬럼 + 광고 킬스위치 시딩 (2026-08-07, plan-ads-monetization)
--
-- revive_count: 순수 랭킹(WHERE revive_count = 0)용. JSONB 로그 스캔 대신 컬럼.
-- ads_*: fail-closed 기본값. 원격에서 true로 켠다.
--
-- 적용 방법: Supabase Dashboard > SQL Editor에 붙여넣고 Run.

ALTER TABLE ghost_runs
  ADD COLUMN IF NOT EXISTS revive_count INTEGER NOT NULL DEFAULT 0;

INSERT INTO remote_config (key, value) VALUES
  ('ads_revive_enabled', 'false'),
  ('ads_interstitial_enabled', 'false'),
  ('ads_interstitial_period', '5')
ON CONFLICT (key) DO NOTHING;
