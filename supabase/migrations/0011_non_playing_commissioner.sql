-- 0011_non_playing_commissioner.sql — a member may run the league without drafting a team.
-- is_player=false members are excluded from the draft order, mock top-ups, and standings.

alter table public.allowed_emails add column is_player boolean not null default true;
alter table public.league_members add column is_player boolean not null default true;

-- carry the flag from the allowlist onto membership at first sign-in
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_allow public.allowed_emails%rowtype;
  v_name text;
begin
  select * into v_allow from public.allowed_emails where lower(email) = lower(new.email);

  v_name := coalesce(
    v_allow.display_name,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, display_name, avatar_url, role)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    case when v_allow.is_commissioner then 'commissioner' else 'member' end
  );

  if v_allow.email is not null then
    insert into public.league_members (league_id, user_id, is_player)
    values (v_allow.league_id, new.id, coalesce(v_allow.is_player, true))
    on conflict do nothing;
    update public.allowed_emails set user_id = new.id where email = v_allow.email;
  end if;

  return new;
end;
$$;

-- draft order: players only
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
  select count(*) into v_users from public.league_members where league_id = p_league_id and is_player;
  if v_users < 2 then raise exception 'need at least 2 drafting members'; end if;
  if v_couples < v_users * v_league.roster_size then raise exception 'not enough couples for roster_size'; end if;

  select array_agg(user_id order by md5(v_seed || user_id::text))
    into v_order
    from public.league_members where league_id = p_league_id and is_player;

  update public.leagues
     set draft_order = v_order, draft_rng_seed = v_seed, draft_status = 'live',
         current_pick = 0, turn_started_at = now()
   where id = p_league_id;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'seed', v_seed);
end;
$$;

-- mock: top up *players* to p_total
create or replace function public.fn_start_mock_draft(p_league_id uuid, p_total int default 4)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_players int;
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

  select count(*) into v_players from public.league_members where league_id = p_league_id and is_player;
  for i in 1..greatest(0, p_total - v_players) loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'proxy-' || i || '-' || left(p_league_id::text, 8) || '@mock.invalid', '', now(),
            '{"provider":"mock","providers":["mock"]}'::jsonb,
            jsonb_build_object('full_name', 'Proxy ' || i), now(), now(), '', '', '', '', '', '', '', '');
    update public.profiles set is_mock = true where id = v_uid;
    insert into public.league_members (league_id, user_id, is_player) values (p_league_id, v_uid, true) on conflict do nothing;
  end loop;

  update public.leagues set is_mock = true where id = p_league_id;
  return public.fn_start_draft(p_league_id, 'mock-' || gen_random_uuid()::text);
end;
$$;

-- standings: players only
create or replace view public.v_standings
with (security_invoker = true) as
with completed_weeks as (
  select season, week from public.episodes group by season, week having max(air_time) < now()
),
points as (
  select s.league_id, s.user_id, count(*)::int as survival_points
  from public.v_roster_stints s
  join public.leagues lg on lg.id = s.league_id
  join completed_weeks w on w.season = lg.season
  where w.week >= s.joined_week and (s.left_week is null or w.week < s.left_week)
  group by s.league_id, s.user_id
),
active as (
  select r.league_id, r.user_id, count(*)::int as active_couples
  from public.v_current_rosters r
  join public.couples c on c.id = r.couple_id
  where c.status in ('active','finalist')
  group by r.league_id, r.user_id
),
best as (
  select re.league_id, re.user_id,
         min(case when c.status in ('active','finalist') and c.placement is null then 0 else c.placement end) as best_placement,
         bool_or(c.placement = 1) as has_champion
  from (select distinct league_id, user_id, couple_id from public.roster_events where event in ('drafted','replacement')) re
  join public.couples c on c.id = re.couple_id
  group by re.league_id, re.user_id
)
select lm.league_id, lm.user_id, p.display_name,
       coalesce(pt.survival_points, 0) as survival_points,
       coalesce(a.active_couples, 0) as active_couples,
       b.best_placement,
       coalesce(b.has_champion, false) as is_grand_champion,
       array_position(lg.draft_order, lm.user_id) as draft_slot,
       rank() over (
         partition by lm.league_id
         order by coalesce(pt.survival_points,0) desc,
                  coalesce(a.active_couples,0) desc,
                  coalesce(b.best_placement, 999) asc,
                  array_position(lg.draft_order, lm.user_id) asc nulls last
       ) as podium_rank
from public.league_members lm
join public.leagues lg on lg.id = lm.league_id
join public.profiles p on p.id = lm.user_id
left join points pt on pt.league_id = lm.league_id and pt.user_id = lm.user_id
left join active a on a.league_id = lm.league_id and a.user_id = lm.user_id
left join best b on b.league_id = lm.league_id and b.user_id = lm.user_id
where lm.is_player;

-- commissioner may change a member's player flag
create policy league_members_update on public.league_members for update to authenticated
  using (public.is_commissioner() and public.is_member(league_id));
