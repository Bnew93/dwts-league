-- 0009_draft_scheduled_at.sql — commissioner-set estimated draft start, shown as a
-- countdown in the lobby. Display only: the draft opens when the commissioner confirms.
alter table public.leagues add column draft_scheduled_at timestamptz;
