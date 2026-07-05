-- 001: ghost_runs.meta 컬럼 추가 (2026-07-05)
--
-- 배경: 클라이언트(remoteStore.ts)가 Forward-design 슬롯으로 meta를 select/insert에
-- 포함했는데, PostgREST는 존재하지 않는 컬럼을 조용히 무시하지 않는다 —
-- select는 42703("column ghost_runs.meta does not exist"), insert는 PGRST204로 실패.
-- 이 때문에 고스트 로그 읽기/쓰기가 모두 400으로 깨져 있었다.
--
-- 적용 방법: Supabase Dashboard > SQL Editor에 이 파일 내용을 붙여넣고 Run.
-- (클라이언트는 컬럼이 없어도 폴백하도록 수정됨 — 이 마이그레이션은 meta 저장을 살린다.)

ALTER TABLE ghost_runs ADD COLUMN IF NOT EXISTS meta JSONB;
