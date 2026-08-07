-- 007: 배너 최소 뷰포트 높이 (이미 006을 적용한 DB용 upsert)
-- 폰 가로에서 게임면이 과도하게 줄어드는 걸 막기 위해 500px 미만은 배너 생략.
INSERT INTO remote_config (key, value) VALUES
  ('ads_banner_min_viewport_h', '500'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();
