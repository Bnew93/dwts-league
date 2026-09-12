-- 0003_start_draft_service_ctx.sql
-- fn_start_draft: allow a service-role/SQL context (auth.uid() is null) to start a draft,
-- matching the other functions. Signed-in callers must still be the commissioner.
-- Also: fn_reset_draft for the commissioner to wipe a draft that has not completed
-- (pre-season dry runs only; refuses once draft_status = 'complete').

create or replace function public.fn_start_draft(p_league_id uuid, p_seed text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_seed text := coalesce(p_seed, gen_random_uuid()::text);
  v_order uuid[];
  v_couples int;
  v_users int;
begin
  if auth.uid() is not null and not public.is_commissioner() then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if v_league.draft_status <> 'pending' then raise exception 'draft already started'; end if;

  select count(*) into v_couples from public.couples where league_id = p_league_id and status = 'active';
  select count(*) into v_users from public.league_members where league_id = p_league_id;
  if v_users < 2 then raise exception 'need at least 2 members'; end if;
  if v_couples < v_users * v_league.roster_size then raise exception 'not enough couples for roster_size'; end if;

  select array_agg(user_id order by md5(v_seed || user_id::text))
    into v_order
    from public.league_members where league_id = p_league_id;

  update public.leagues
     set draft_order = v_order, draft_rng_seed = v_seed, draft_status = 'live',
         current_pick = 0, turn_started_at = now()
   where id = p_league_id;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'seed', v_seed);
end;
$$;

create or replace function public.fn_reset_draft(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
begin
  if auth.uid() is not null and not public.is_commissioner() then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
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

revoke execute on function public.fn_reset_draft(uuid) from public, anon;
grant execute on function public.fn_reset_draft(uuid) to authenticated;
