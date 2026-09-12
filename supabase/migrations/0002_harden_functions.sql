-- 0002_harden_functions.sql — address Supabase security advisor findings after 0001.
-- 1) No function is callable by anon (unauthenticated REST). Internal helpers only via triggers/policies.
-- 2) Fixed search_path on every function.
-- 3) pg_net lives in the extensions schema, not public.

-- anon can execute nothing in public
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke execute on functions from anon, public;

-- trigger-only functions: not callable by signed-in users either
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.protect_profile_role() from authenticated;

-- policy helpers must remain executable by authenticated (RLS evaluates as the caller)
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_commissioner() to authenticated;
grant execute on function public.my_league_ids() to authenticated;
-- user-facing RPCs (self-authorize inside)
grant execute on function public.fn_make_pick(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_start_draft(uuid, text) to authenticated;
grant execute on function public.fn_apply_results(uuid, jsonb, text, uuid, boolean) to authenticated;
grant execute on function public.fn_fulfill_claim(uuid, uuid, uuid) to authenticated;
-- pure helpers used inside views/functions
grant execute on function public.fn_pick_owner(uuid[], int) to authenticated;
grant execute on function public.fn_next_claim_deadline(int) to authenticated;
grant execute on function public.fn_next_week(int) to authenticated;

-- fixed search_path
alter function public.fn_pick_owner(uuid[], int) set search_path = public;
alter function public.fn_next_claim_deadline(int) set search_path = public;
alter function public.fn_next_week(int) set search_path = public;
alter function public.protect_profile_role() set search_path = public;

-- pg_net out of public
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
