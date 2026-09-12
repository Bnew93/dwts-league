-- 0006_end_mock_wipes_results.sql
-- While a league is in mock mode nothing counts, so ending the mock also reverts
-- any manual results entered during it (couples back to active, claims/events gone).
-- Starting a mock still requires a clean league (no roster history).

create or replace function public.fn_end_mock_draft(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_removed int;
begin
  if auth.uid() is not null and not public.is_commissioner() then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if not v_league.is_mock then raise exception 'league is not in mock mode'; end if;

  delete from public.results_events where couple_id in (select id from public.couples where league_id = p_league_id);
  delete from public.replacement_claims where league_id = p_league_id;
  delete from public.roster_events where league_id = p_league_id;
  delete from public.draft_picks where league_id = p_league_id;
  delete from public.judge_scores where couple_id in (select id from public.couples where league_id = p_league_id);

  update public.couples
     set status = 'active', elimination_week = null, elimination_date = null, placement = null, updated_at = now()
   where league_id = p_league_id;

  with mocks as (
    select p.id from public.profiles p
    join public.league_members lm on lm.user_id = p.id and lm.league_id = p_league_id
    where p.is_mock
  ), del as (
    delete from auth.users u using mocks where u.id = mocks.id returning u.id
  )
  select count(*) into v_removed from del;

  update public.leagues
     set draft_status = 'pending', draft_order = null, draft_rng_seed = null,
         current_pick = 0, turn_started_at = null, is_mock = false, season_complete = false
   where id = p_league_id;

  return jsonb_build_object('ok', true, 'proxies_removed', v_removed);
end;
$$;
