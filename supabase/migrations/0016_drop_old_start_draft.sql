-- 0016_drop_old_start_draft.sql — 0013 added fn_start_draft(uuid, text, boolean) as a new overload;
-- the 0011 two-argument version still existed (and still referenced the dropped draft_status column).
-- Remove it so there is exactly one callable signature.
drop function if exists public.fn_start_draft(uuid, text);
