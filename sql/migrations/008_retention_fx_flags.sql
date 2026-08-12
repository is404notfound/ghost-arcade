-- 008: 리텐션 연출 킬스위치 시딩 (부활 만화 / 2판 PB 토스트)
-- sim 값(초반 히트 용서)은 원격화하지 않음 — SIM_VERSION 1.17.0에 베이크.
-- 적용: Supabase Dashboard > SQL Editor에서 Run.

INSERT INTO remote_config (key, value) VALUES
  ('revive_fx_enabled', 'true'::jsonb),
  ('run2_pb_toast_enabled', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = NOW();
