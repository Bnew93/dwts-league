-- 0001_init.sql — DWTS Fantasy League schema, RLS, views, functions, cron.
-- Spec: IMPLEMENTATION_PLAN.md §3 (data model) and §1 (rules).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role text not null default 'member' check (role in ('commissioner','member')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- League / settings
-- ---------------------------------------------------------------------------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season int not null default 35,
  roster_size int not null default 3,
  pick_seconds int not null default 60,
  draft_status text not null default 'pending' check (draft_status in ('pending','live','complete')),
  draft_order uuid[],
  draft_rng_seed text,
  current_pick int not null default 0,
  turn_started_at timestamptz,
  season_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- Sign-in allowlist. Seeded by the commissioner before members sign in.
-- handle_new_user() joins the matching league on first Google login.
create table public.allowed_emails (
  email text primary key,
  league_id uuid not null references public.leagues(id) on delete cascade,
  display_name text,
  is_commissioner boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Show data
-- ---------------------------------------------------------------------------
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season int not null default 35,
  celebrity text not null,
  celebrity_key text not null,
  professional text not null,
  notability text,
  cast_order int not null,
  status text not null default 'active' check (status in ('active','eliminated','withdrew','finalist')),
  elimination_week int,
  elimination_date date,
  placement int,
  updated_at timestamptz not null default now(),
  unique (league_id, celebrity_key)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  season int not null default 35,
  week int not null,
  air_date date not null,
  air_time timestamptz not null,
  title text,
  has_elimination boolean not null default true
);
create index episodes_season_week_idx on public.episodes (season, week);

create table public.judge_scores (
  couple_id uuid not null references public.couples(id) on delete cascade,
  week int not null,
  total numeric,
  detail jsonb,
  primary key (couple_id, week)
);

-- ---------------------------------------------------------------------------
-- Draft
-- ---------------------------------------------------------------------------
create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  round int not null,
  pick_no int not null,
  user_id uuid not null references public.profiles(id),
  couple_id uuid not null unique references public.couples(id),
  auto boolean not null default false,
  made_at timestamptz not null default now(),
  unique (league_id, pick_no)
);

-- ---------------------------------------------------------------------------
-- Rosters — append-only ledger. Current roster is derived (v_current_rosters).
-- ---------------------------------------------------------------------------
create table public.roster_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  couple_id uuid not null references public.couples(id),
  event text not null check (event in ('drafted','replacement','eliminated','withdrew')),
  week int not null default 0,
  source text not null check (source in ('draft','claim','ingest','admin')),
  created_at timestamptz not null default now()
);
create index roster_events_league_idx on public.roster_events (league_id, user_id, couple_id, created_at);

-- ---------------------------------------------------------------------------
-- Replacement claims
-- ---------------------------------------------------------------------------
create table public.replacement_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  lost_couple_id uuid not null references public.couples(id),
  queue_pos int not null,
  status text not null default 'pending' check (status in ('pending','fulfilled','void','expired')),
  picked_couple_id uuid references public.couples(id),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index replacement_claims_queue_idx on public.replacement_claims (league_id, status, queue_pos);

-- ---------------------------------------------------------------------------
-- Ingestion
-- ---------------------------------------------------------------------------
create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','no_change','needs_review','error')),
  source_url text,
  content_hash text,
  diff jsonb,
  error text
);

create table public.results_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.ingest_runs(id) on delete set null,
  couple_id uuid not null references public.couples(id),
  change jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_member(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_commissioner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'commissioner'
  );
$$;

-- Leagues the current user belongs to (used by policies on tables without league_id).
create or replace function public.my_league_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select league_id from public.league_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Auth trigger: create profile, join league if email is allowlisted
-- ---------------------------------------------------------------------------
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
    insert into public.league_members (league_id, user_id)
    values (v_allow.league_id, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Latest roster event per (league, user, couple); couple is on roster if that
-- event is drafted/replacement.
create or replace view public.v_current_rosters
with (security_invoker = true) as
with latest as (
  select distinct on (league_id, user_id, couple_id)
    league_id, user_id, couple_id, event, week, created_at
  from public.roster_events
  order by league_id, user_id, couple_id, created_at desc, id desc
)
select l.league_id, l.user_id, l.couple_id, l.week as joined_week, l.created_at as joined_at
from latest l
where l.event in ('drafted','replacement');

-- Leftovers: active couples not currently on any roster.
create or replace view public.v_leftovers
with (security_invoker = true) as
select c.*
from public.couples c
where c.status = 'active'
  and not exists (select 1 from public.v_current_rosters r where r.couple_id = c.id);

-- Every stint a couple spent on a roster: [joined_week, left_week).
-- left_week = elimination week (exclusive) or null while active.
create or replace view public.v_roster_stints
with (security_invoker = true) as
with ev as (
  select re.*,
         lead(re.event) over (partition by re.league_id, re.user_id, re.couple_id order by re.created_at, re.id) as next_event,
         lead(re.week)  over (partition by re.league_id, re.user_id, re.couple_id order by re.created_at, re.id) as next_week
  from public.roster_events re
)
select league_id, user_id, couple_id,
       greatest(week, 1) as joined_week,
       case when next_event in ('eliminated','withdrew') then next_week end as left_week
from ev
where event in ('drafted','replacement');

-- Survival points: 1 point per completed show week W where joined_week <= W < left_week.
-- A week is complete once its (latest) air_time has passed.
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
left join best b on b.league_id = lm.league_id and b.user_id = lm.user_id;

-- ---------------------------------------------------------------------------
-- Draft functions
-- ---------------------------------------------------------------------------

-- Snake order: who owns pick number p (1-based) given n users.
create or replace function public.fn_pick_owner(p_order uuid[], p_pick_no int)
returns uuid language sql immutable as $$
  select p_order[
    case when ((p_pick_no - 1) / array_length(p_order, 1)) % 2 = 0
      then ((p_pick_no - 1) % array_length(p_order, 1)) + 1
      else array_length(p_order, 1) - ((p_pick_no - 1) % array_length(p_order, 1))
    end
  ];
$$;

-- Internal: commit a pick. Caller must hold the league row lock.
create or replace function public.fn_commit_pick(p_league public.leagues, p_user_id uuid, p_couple_id uuid, p_auto boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_n int := array_length(p_league.draft_order, 1);
  v_pick_no int := p_league.current_pick + 1;
  v_total int := p_league.roster_size * v_n;
  v_round int := ((v_pick_no - 1) / v_n) + 1;
begin
  insert into public.draft_picks (league_id, round, pick_no, user_id, couple_id, auto)
  values (p_league.id, v_round, v_pick_no, p_user_id, p_couple_id, p_auto);

  insert into public.roster_events (league_id, user_id, couple_id, event, week, source)
  values (p_league.id, p_user_id, p_couple_id, 'drafted', 0, 'draft');

  if v_pick_no >= v_total then
    update public.leagues
       set current_pick = v_pick_no, draft_status = 'complete', turn_started_at = null
     where id = p_league.id;
  else
    update public.leagues
       set current_pick = v_pick_no, turn_started_at = now()
     where id = p_league.id;
  end if;
end;
$$;

-- Public: a user makes their pick. Atomic; rejects wrong turn / taken couple.
create or replace function public.fn_make_pick(p_league_id uuid, p_user_id uuid, p_couple_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_owner uuid;
  v_couple public.couples%rowtype;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot pick for another user';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
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

-- pg_cron: auto-pick when the on-the-clock user is overdue (lowest cast_order).
create or replace function public.fn_expire_overdue_pick()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_owner uuid;
  v_couple_id uuid;
  v_count int := 0;
begin
  for v_league in
    select * from public.leagues
    where draft_status = 'live'
      and turn_started_at is not null
      and now() > turn_started_at + make_interval(secs => pick_seconds)
    for update skip locked
  loop
    v_owner := public.fn_pick_owner(v_league.draft_order, v_league.current_pick + 1);
    select c.id into v_couple_id
      from public.couples c
     where c.league_id = v_league.id and c.status = 'active'
       and not exists (select 1 from public.draft_picks d where d.couple_id = c.id)
     order by c.cast_order asc
     limit 1;
    if v_couple_id is null then
      update public.leagues set draft_status = 'complete', turn_started_at = null where id = v_league.id;
    else
      perform public.fn_commit_pick(v_league, v_owner, v_couple_id, true);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Commissioner: start the draft with a seeded random order.
create or replace function public.fn_start_draft(p_league_id uuid, p_seed text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_seed text := coalesce(p_seed, gen_random_uuid()::text);
  v_order uuid[];
  v_couples int;
  v_users int;
begin
  if not public.is_commissioner() then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if v_league.draft_status <> 'pending' then raise exception 'draft already started'; end if;

  select count(*) into v_couples from public.couples where league_id = p_league_id and status = 'active';
  select count(*) into v_users from public.league_members where league_id = p_league_id;
  if v_users < 2 then raise exception 'need at least 2 members'; end if;
  if v_couples < v_users * v_league.roster_size then raise exception 'not enough couples for roster_size'; end if;

  -- seeded shuffle: order members by md5(seed || user_id)
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

-- ---------------------------------------------------------------------------
-- Results functions
-- ---------------------------------------------------------------------------

-- Deadline for a claim: next episode air_time − 1h (null if season is over).
create or replace function public.fn_next_claim_deadline(p_season int)
returns timestamptz language sql stable as $$
  select min(air_time) - interval '1 hour' from public.episodes
  where season = p_season and air_time > now();
$$;

-- Week of the next upcoming episode (the first week a replacement is at risk).
create or replace function public.fn_next_week(p_season int)
returns int language sql stable as $$
  select coalesce(min(week), (select coalesce(max(week),0) + 1 from public.episodes where season = p_season))
  from public.episodes where season = p_season and air_time > now();
$$;

-- Apply a results diff. p_diff is a jsonb array of objects:
--   { couple_id, status, elimination_week, elimination_date, placement }
-- Order of the array = elimination order (drives claim queue order).
-- Only active → eliminated|withdrew|finalist and placement assignments are applied.
-- Any transition that would un-eliminate a couple raises unless p_allow_revert.
create or replace function public.fn_apply_results(p_league_id uuid, p_diff jsonb, p_source text default 'ingest', p_run_id uuid default null, p_allow_revert boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_item jsonb;
  v_couple public.couples%rowtype;
  v_new_status text;
  v_week int;
  v_placement int;
  v_date date;
  v_owner uuid;
  v_queue int;
  v_deadline timestamptz;
  v_has_leftovers boolean;
  v_applied int := 0;
  v_claims int := 0;
  v_changes jsonb := '[]'::jsonb;
begin
  if p_source not in ('ingest','admin') then raise exception 'bad source'; end if;
  if p_source = 'admin' and auth.uid() is not null and not public.is_commissioner() then
    raise exception 'commissioner only';
  end if;

  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;

  v_deadline := public.fn_next_claim_deadline(v_league.season);
  select coalesce(max(queue_pos), 0) into v_queue from public.replacement_claims where league_id = p_league_id;

  for v_item in select * from jsonb_array_elements(p_diff) loop
    select * into v_couple from public.couples where id = (v_item->>'couple_id')::uuid and league_id = p_league_id for update;
    if not found then raise exception 'couple % not in league', v_item->>'couple_id'; end if;

    v_new_status := coalesce(v_item->>'status', v_couple.status);
    v_week := coalesce((v_item->>'elimination_week')::int, v_couple.elimination_week);
    v_placement := coalesce((v_item->>'placement')::int, v_couple.placement);
    v_date := coalesce((v_item->>'elimination_date')::date, v_couple.elimination_date);

    if v_new_status not in ('active','eliminated','withdrew','finalist') then
      raise exception 'bad status %', v_new_status;
    end if;

    -- revert guard
    if v_couple.status in ('eliminated','withdrew') and v_new_status in ('active','finalist') then
      if not p_allow_revert then
        raise exception 'refusing to un-eliminate % (needs_review)', v_couple.celebrity;
      end if;
      -- admin undo: restore couple, remove the elimination ledger rows, void open claims
      update public.couples set status = 'active', elimination_week = null, elimination_date = null, placement = null, updated_at = now()
       where id = v_couple.id;
      delete from public.roster_events where couple_id = v_couple.id and event in ('eliminated','withdrew');
      update public.replacement_claims set status = 'void', resolved_at = now()
       where lost_couple_id = v_couple.id and status = 'pending';
      v_changes := v_changes || jsonb_build_object('couple_id', v_couple.id, 'celebrity', v_couple.celebrity, 'revert', true);
      v_applied := v_applied + 1;
      continue;
    end if;

    -- idempotent: nothing to do
    if v_couple.status = v_new_status
       and v_couple.elimination_week is not distinct from v_week
       and v_couple.placement is not distinct from v_placement then
      continue;
    end if;

    update public.couples
       set status = v_new_status, elimination_week = v_week, elimination_date = v_date,
           placement = v_placement, updated_at = now()
     where id = v_couple.id;

    v_changes := v_changes || jsonb_build_object(
      'couple_id', v_couple.id, 'celebrity', v_couple.celebrity,
      'from', v_couple.status, 'to', v_new_status, 'week', v_week, 'placement', v_placement);
    v_applied := v_applied + 1;

    if p_run_id is not null then
      insert into public.results_events (run_id, couple_id, change)
      values (p_run_id, v_couple.id, v_changes -> (jsonb_array_length(v_changes) - 1));
    end if;

    -- Roster impact: couple leaves its owner's roster; owner gets a claim.
    if v_couple.status in ('active','finalist') and v_new_status in ('eliminated','withdrew') then
      select user_id into v_owner from public.v_current_rosters where league_id = p_league_id and couple_id = v_couple.id;
      if v_owner is not null then
        insert into public.roster_events (league_id, user_id, couple_id, event, week, source)
        values (p_league_id, v_owner, v_couple.id, v_new_status, coalesce(v_week, 0), p_source);

        select exists (select 1 from public.v_leftovers l where l.league_id = p_league_id) into v_has_leftovers;
        v_queue := v_queue + 1;
        insert into public.replacement_claims (league_id, user_id, lost_couple_id, queue_pos, status, deadline)
        values (p_league_id, v_owner, v_couple.id, v_queue,
                case when v_has_leftovers then 'pending' else 'void' end,
                case when v_has_leftovers then v_deadline end);
        v_claims := v_claims + 1;
      end if;
    end if;
  end loop;

  -- Finale: every couple placed → season complete.
  if not exists (select 1 from public.couples where league_id = p_league_id and status in ('active','finalist') and placement is null)
     and exists (select 1 from public.couples where league_id = p_league_id and placement = 1) then
    update public.leagues set season_complete = true where id = p_league_id;
  end if;

  return jsonb_build_object('applied', v_applied, 'claims', v_claims, 'changes', v_changes);
end;
$$;

-- Fulfill the head-of-queue claim with a leftover couple.
create or replace function public.fn_fulfill_claim(p_claim_id uuid, p_user_id uuid, p_couple_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_claim public.replacement_claims%rowtype;
  v_league public.leagues%rowtype;
  v_head uuid;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot fulfill for another user';
  end if;

  select * into v_claim from public.replacement_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  if v_claim.user_id <> p_user_id then raise exception 'not your claim'; end if;
  if v_claim.status <> 'pending' then raise exception 'claim is %', v_claim.status; end if;

  select * into v_league from public.leagues where id = v_claim.league_id for update;

  select id into v_head from public.replacement_claims
   where league_id = v_claim.league_id and status = 'pending'
   order by queue_pos asc limit 1;
  if v_head <> p_claim_id then raise exception 'not at head of queue'; end if;

  if not exists (select 1 from public.v_leftovers l where l.id = p_couple_id and l.league_id = v_claim.league_id) then
    raise exception 'couple is not an available leftover';
  end if;

  insert into public.roster_events (league_id, user_id, couple_id, event, week, source)
  values (v_claim.league_id, p_user_id, p_couple_id, 'replacement', public.fn_next_week(v_league.season), 'claim');

  update public.replacement_claims
     set status = 'fulfilled', picked_couple_id = p_couple_id, resolved_at = now()
   where id = p_claim_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- pg_cron: expire overdue claims. Auto-pick highest cumulative judges' score
-- (ties → lowest cast_order); void if the pool is empty.
create or replace function public.fn_expire_claims()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_claim public.replacement_claims%rowtype;
  v_league public.leagues%rowtype;
  v_pick uuid;
  v_count int := 0;
begin
  for v_claim in
    select * from public.replacement_claims c
    where c.status = 'pending' and c.deadline is not null and c.deadline < now()
      and c.queue_pos = (select min(queue_pos) from public.replacement_claims x
                          where x.league_id = c.league_id and x.status = 'pending')
    order by c.league_id, c.queue_pos
    for update skip locked
  loop
    select * into v_league from public.leagues where id = v_claim.league_id for update;

    select l.id into v_pick
      from public.v_leftovers l
      left join (select couple_id, sum(total) as tot from public.judge_scores group by couple_id) js on js.couple_id = l.id
     where l.league_id = v_claim.league_id
     order by coalesce(js.tot, 0) desc, l.cast_order asc
     limit 1;

    if v_pick is null then
      update public.replacement_claims set status = 'void', resolved_at = now() where id = v_claim.id;
    else
      insert into public.roster_events (league_id, user_id, couple_id, event, week, source)
      values (v_claim.league_id, v_claim.user_id, v_pick, 'replacement', public.fn_next_week(v_league.season), 'claim');
      update public.replacement_claims
         set status = 'expired', picked_couple_id = v_pick, resolved_at = now()
       where id = v_claim.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.couples enable row level security;
alter table public.episodes enable row level security;
alter table public.judge_scores enable row level security;
alter table public.draft_picks enable row level security;
alter table public.roster_events enable row level security;
alter table public.replacement_claims enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.results_events enable row level security;

-- profiles: any signed-in user can read; users update their own row (role is protected by trigger below)
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.protect_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role <> old.role and not public.is_commissioner() then
    raise exception 'only the commissioner can change roles';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- leagues: members read; commissioner updates settings
create policy leagues_select on public.leagues for select to authenticated using (public.is_member(id));
create policy leagues_update on public.leagues for update to authenticated using (public.is_commissioner() and public.is_member(id));

-- league_members: members read their league
create policy league_members_select on public.league_members for select to authenticated using (public.is_member(league_id));

-- allowed_emails: commissioner only
create policy allowed_emails_all on public.allowed_emails for all to authenticated
  using (public.is_commissioner()) with check (public.is_commissioner());

-- couples: members read; commissioner may edit cast_order / names
create policy couples_select on public.couples for select to authenticated using (public.is_member(league_id));
create policy couples_update on public.couples for update to authenticated using (public.is_commissioner() and public.is_member(league_id));

-- episodes: all signed-in read; commissioner edits
create policy episodes_select on public.episodes for select to authenticated using (true);
create policy episodes_write on public.episodes for all to authenticated
  using (public.is_commissioner()) with check (public.is_commissioner());

-- judge_scores: members read (via couple)
create policy judge_scores_select on public.judge_scores for select to authenticated
  using (exists (select 1 from public.couples c where c.id = couple_id and public.is_member(c.league_id)));

-- ledgers: read-only for members; writes only via SECURITY DEFINER functions
create policy draft_picks_select on public.draft_picks for select to authenticated using (public.is_member(league_id));
create policy roster_events_select on public.roster_events for select to authenticated using (public.is_member(league_id));
create policy claims_select on public.replacement_claims for select to authenticated using (public.is_member(league_id));
-- commissioner may reorder / void claims
create policy claims_update on public.replacement_claims for update to authenticated
  using (public.is_commissioner() and public.is_member(league_id));

-- ingestion logs: commissioner reads
create policy ingest_runs_select on public.ingest_runs for select to authenticated using (public.is_commissioner());
create policy results_events_select on public.results_events for select to authenticated using (public.is_commissioner());

-- Functions callable by signed-in users (they self-authorize inside).
revoke all on function public.fn_commit_pick(public.leagues, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.fn_expire_overdue_pick() from public, anon, authenticated;
revoke all on function public.fn_expire_claims() from public, anon, authenticated;
grant execute on function public.fn_make_pick(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_start_draft(uuid, text) to authenticated;
grant execute on function public.fn_apply_results(uuid, jsonb, text, uuid, boolean) to authenticated;
grant execute on function public.fn_fulfill_claim(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: draft room subscribes to these
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.draft_picks, public.leagues, public.couples, public.replacement_claims;

-- ---------------------------------------------------------------------------
-- Cron
-- ---------------------------------------------------------------------------
select cron.schedule('expire_overdue_pick', '15 seconds', $$select public.fn_expire_overdue_pick()$$);
select cron.schedule('expire_claims', '0 * * * *', $$select public.fn_expire_claims()$$);
