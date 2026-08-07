-- 006: 전면광고 ON(lifetime≥5·5판 주기) + 배너 ON
-- 적용: Supabase Dashboard > SQL Editor에서 Run.

INSERT INTO remote_config (key, value) VALUES
  ('ads_interstitial_enabled', 'true'::jsonb),
  ('ads_interstitial_period', '5'::jsonb),
  ('ads_interstitial_min_lifetime_run', '5'::jsonb),
  ('ads_banner_enabled', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();

-- SELECT key, value, jsonb_typeof(value) FROM remote_config WHERE key LIKE 'ads_%';
