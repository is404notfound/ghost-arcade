-- 003: 원격 킬스위치 + 이벤트 미러 (2026-07-19, 플레이북 §0 코드 대비)
--
-- remote_config: 재검수(영업일 3~5일) 없이 조정 가능한 기능 플래그. 클라는 부트 시
--   1회 읽기만 한다. 값 변경은 Supabase 대시보드에서 직접 (UPDATE remote_config ...).
--   sim 값은 절대 여기 넣지 않는다 — 결정론·공정성 침해 (src/remoteConfig.ts 원칙).
--
-- event_mirror: PostHog 이중화. 검수에서 PostHog 키를 끄게 될 경우 판정표의 최소
--   데이터 소스 (game_start·abnormal_exit — game_over는 ghost_runs가 이미 미러).
--
-- 적용 방법: Supabase Dashboard > SQL Editor에 붙여넣고 Run.

CREATE TABLE IF NOT EXISTS remote_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 스위치 시딩 (이미 있으면 건드리지 않음 — 운영 중 변경값 보존)
INSERT INTO remote_config (key, value) VALUES
  ('blackout_enabled',   'true'),
  ('blackout_edge_ratio','0.7'),
  ('bot_upload_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS event_mirror (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event      TEXT        NOT NULL,
  user_id    TEXT,
  props      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 일별 집계 스캔용 (event='game_start' 카운트, abnormal_exit 추세)
CREATE INDEX IF NOT EXISTS idx_event_mirror_event_time
  ON event_mirror (event, created_at);

-- RLS를 켜서 운영하는 경우의 최소 정책 (현재 ghost_runs와 동일 기조):
--   remote_config: anon SELECT만 / event_mirror: anon INSERT만 (SELECT 불필요 — 클라가 읽을 일 없음)
-- RLS 미사용 환경이면 이 블록은 무시.
-- ALTER TABLE remote_config ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY remote_config_read ON remote_config FOR SELECT TO anon USING (true);
-- ALTER TABLE event_mirror ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY event_mirror_insert ON event_mirror FOR INSERT TO anon WITH CHECK (true);
