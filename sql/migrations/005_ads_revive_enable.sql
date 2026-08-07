-- 005: 광고 킬스위치 시딩 + 이어뛰기 ON + anon 읽기 정책
--
-- 증상: 클라가 remote_config를 빈 배열로 받아 ads_revive_enabled 기본값(false) 유지
--       → 사망 시 이어뛰기 팝업 자체를 안 띄움.
-- 적용: Supabase Dashboard > SQL Editor에서 Run.

INSERT INTO remote_config (key, value) VALUES
  ('blackout_enabled', 'true'::jsonb),
  ('blackout_edge_ratio', '0.7'::jsonb),
  ('bot_upload_enabled', 'true'::jsonb),
  ('ads_revive_enabled', 'true'::jsonb),
  ('ads_interstitial_enabled', 'false'::jsonb),
  ('ads_interstitial_period', '5'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();

-- RLS가 켜져 있으면 anon SELECT가 비면 클라가 영원히 기본값만 씀
ALTER TABLE remote_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remote_config_read ON remote_config;
CREATE POLICY remote_config_read ON remote_config
  FOR SELECT TO anon, authenticated
  USING (true);

-- 확인: value 타입이 boolean/number 인지 (따옴표 문자열 "true" 이면 클라가 무시함)
-- SELECT key, value, jsonb_typeof(value) FROM remote_config WHERE key LIKE 'ads_%';
