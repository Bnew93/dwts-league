-- 0005_mock_draft.sql — commissioner-driven mock draft with proxy members.
-- Proxies are real auth.users/profiles rows flagged is_mock so every function
-- (fn_make_pick, fn_expire_overdue_pick, views) behaves exactly as in a real draft.
-- fn_end_mock_draft removes picks, roster events, and the proxies.

alter table public.profiles add column is_mock boolean not null default false;
alter table public.leagues  add column is_mock boolean not null default false;

-- fn_make_pick: the commissioner may pick on behalf of a mock member while the league is in mock mode.
create or replace function public.fn_make_pick(p_league_id uuid, p_user_id uuid, p_couple_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_owner uuid;
  v_couple public.couples%rowtype;
begin
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    if not (v_league.is_mock and public.is_commissioner()
            and exists (select 1 from public.profiles where id = p_user_id and is_mock)) then
      raise exception 'cannot pick for another user';
    end if;
  end if;

  if v_league.draft_status <> 'live' then raise exception 'draft is not live'; end if;

  v_owner := public.fn_pick_owner(v_league.draft_order, v_league.current_pick + 1);
  if v_owner <> p_user_id then raise exception 'not your turn'; end if;

  select * into v_couple from public.couples where id = p_couple_id and league_id = p_league_id for update;
  if not found then raise exception 'couple not found'; end if;
  if v_couple.status <> 'active' then raise exception 'couple is not active'; end if;
  if exists (select 1 from public.draft_picks where couple_id = p_couple_id) then
    raise exception 'couple already drafted';
  end if;

  perform public.fn_commit_pick(v_league, p_user_id, p_couple_id, false);

  return jsonb_build_object('ok', true, 'pick_no', v_league.current_pick + 1);
end;
$$;

-- Start a mock draft: top the league up to p_total members with proxies, then start.
create or replace function public.fn_start_mock_draft(p_league_id uuid, p_total int default 4)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_members int;
  v_uid uuid;
  i int;
begin
  if auth.uid() is not null and not public.is_commissioner() then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if v_league.draft_status <> 'pending' then raise exception 'draft already started'; end if;
  if exists (select 1 from public.roster_events where league_id = p_league_id) then
    raise exception 'league already has roster history';
  end if;

  select count(*) into v_members from public.league_members where league_id = p_league_id;
  for i in 1..greatest(0, p_total - v_members) loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'proxy-' || i || '-' || left(p_league_id::text, 8) || '@mock.invalid', '', now(),
            '{"provider":"mock","providers":["mock"]}'::jsonb,
            jsonb_build_object('full_name', 'Proxy ' || i), now(), now());
    -- handle_new_user() created the profile; flag it and join the league
    update public.profiles set is_mock = true where id = v_uid;
    insert into public.league_members (league_id, user_id) values (p_league_id, v_uid) on conflict do nothing;
  end loop;

  update public.leagues set is_mock = true where id = p_league_id;
  return public.fn_start_draft(p_league_id, 'mock-' || gen_random_uuid()::text);
end;
$$;

-- End a mock draft: wipe picks + draft roster events, reset the draft, remove proxies.
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
  if exists (select 1 from public.roster_events where league_id = p_league_id and source <> 'draft') then
    raise exception 'season has roster activity; cannot end mock';
  end if;

  delete from public.roster_events where league_id = p_league_id;
  delete from public.draft_picks where league_id = p_league_id;
  delete from public.replacement_claims where league_id = p_league_id;

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
         current_pick = 0, turn_started_at = null, is_mock = false
   where id = p_league_id;

  return jsonb_build_object('ok', true, 'proxies_removed', v_removed);
end;
$$;

-- fn_reset_draft must not be used while in mock mode (proxies would linger).
create or replace function public.fn_reset_draft(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
begin
  if auth.uid() is not null and not public.is_commissioner() then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if v_league.is_mock then raise exception 'league is in mock mode; use End mock draft'; end if;
  if v_league.draft_status = 'complete' then raise exception 'draft is complete; cannot reset'; end if;
  if exists (select 1 from public.roster_events where league_id = p_league_id and source <> 'draft') then
    raise exception 'season has roster activity; cannot reset';
  end if;
  delete from public.roster_events where league_id = p_league_id and source = 'draft';
  delete from public.draft_picks where league_id = p_league_id;
  update public.leagues
     set draft_status = 'pending', draft_order = null, draft_rng_seed = null,
         current_pick = 0, turn_started_at = null
   where id = p_league_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.fn_start_mock_draft(uuid, int) from public, anon;
revoke execute on function public.fn_end_mock_draft(uuid) from public, anon;
grant execute on function public.fn_start_mock_draft(uuid, int) to authenticated;
grant execute on function public.fn_end_mock_draft(uuid) to authenticated;
