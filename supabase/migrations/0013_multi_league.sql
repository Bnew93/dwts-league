-- 0013_multi_league.sql — Phase 1.5: many leagues share one season of show data.
-- Spec: PHASE_1_5_MULTI_LEAGUE.md (§1 roles, §2 schema, §3 functions). Decisions recorded there:
--   * couples/episodes are season-scoped (no league_id); draft_picks unique per (league, couple).
--   * leagues.status setup→drafting→active→complete replaces draft_status + season_complete.
--   * league role lives on league_members.role; profiles.role is gone. Platform admin is a
--     profiles flag set only by migration (0014).
--   * The allowlist (allowed_emails, fn_claim_membership) is replaced by invite links.
--   * A new member of a new league drafts (is_player=true); the legacy flag is kept only so
--     League 1's non-drafting commissioner keeps working. Roster math counts players.
--   * profiles.last_reveal_key moves to league_members (one cursor per league).
--   * profiles no longer FK auth.users, so an anonymized profile survives account deletion.
-- Safety: League 1's draft_picks / roster_events are fingerprinted at the top and re-checked at
-- the bottom; any difference raises and rolls the whole migration back.

begin;

-- ---------------------------------------------------------------------------
-- 0. Fingerprint the roster ledgers before touching anything
-- ---------------------------------------------------------------------------
create temp table mig_fp on commit drop as
select 'draft_picks'::text as t, count(*)::int as n,
       md5(coalesce(string_agg(couple_id::text || user_id::text || round::text, ',' order by pick_no), '')) as fp
  from public.draft_picks
union all
select 'roster_events', count(*)::int,
       md5(coalesce(string_agg(couple_id::text || user_id::text || event || week::text, ',' order by created_at, id), ''))
  from public.roster_events;

-- ---------------------------------------------------------------------------
-- 1. Tear down what changes shape: policies, role trigger, allowlist, old functions, views
-- ---------------------------------------------------------------------------
drop policy if exists allowed_emails_all on public.allowed_emails;
drop policy if exists couples_select on public.couples;
drop policy if exists couples_update on public.couples;
drop policy if exists draft_picks_select on public.draft_picks;
drop policy if exists episodes_select on public.episodes;
drop policy if exists episodes_write on public.episodes;
drop policy if exists ingest_runs_select on public.ingest_runs;
drop policy if exists judge_scores_select on public.judge_scores;
drop policy if exists league_members_select on public.league_members;
drop policy if exists league_members_update on public.league_members;
drop policy if exists leagues_select on public.leagues;
drop policy if exists leagues_update on public.leagues;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists claims_select on public.replacement_claims;
drop policy if exists claims_update on public.replacement_claims;
drop policy if exists results_events_select on public.results_events;
drop policy if exists roster_events_select on public.roster_events;

drop trigger if exists profiles_protect_role on public.profiles;
drop function if exists public.protect_profile_role();
drop function if exists public.is_commissioner();
drop function if exists public.fn_claim_membership();
drop function if exists public.fn_apply_results(uuid, jsonb, text, uuid, boolean);
drop function if exists public.fn_start_mock_draft(uuid, int);
drop table if exists public.allowed_emails cascade;
drop view if exists public.v_leftovers;

-- ---------------------------------------------------------------------------
-- 2. Shows (future-platform hook, §2.5a)
-- ---------------------------------------------------------------------------
create table public.shows (
  id text primary key,
  name text not null,
  active boolean not null default true
);
insert into public.shows (id, name) values ('dwts', 'Dancing with the Stars');

-- ---------------------------------------------------------------------------
-- 3. Profiles: platform flags, activity, no auth FK, no league role
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add column is_platform_admin boolean not null default false,
  add column disabled_at timestamptz,
  add column last_seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Show data becomes season-scoped
-- ---------------------------------------------------------------------------
alter table public.couples add column show_id text not null default 'dwts' references public.shows(id);
alter table public.episodes add column show_id text not null default 'dwts' references public.shows(id);
alter table public.couples drop constraint couples_league_id_celebrity_key_key;
alter table public.couples drop column league_id;
alter table public.couples add constraint couples_show_season_key unique (show_id, season, celebrity_key);
create index couples_show_season_idx on public.couples (show_id, season);

-- Two leagues may draft the same couple.
alter table public.draft_picks drop constraint draft_picks_couple_id_key;
alter table public.draft_picks add constraint draft_picks_league_couple_key unique (league_id, couple_id);

-- ---------------------------------------------------------------------------
-- 5. Leagues
-- ---------------------------------------------------------------------------
alter table public.leagues
  add column show_id text not null default 'dwts' references public.shows(id),
  add column slug text,
  add column created_by uuid references public.profiles(id) on delete set null,
  add column status text not null default 'setup' check (status in ('setup','drafting','active','complete')),
  add column member_cap int,
  add column member_count_locked int,
  add column draft_completed_at timestamptz;

update public.leagues lg
   set status = case
                  when lg.season_complete then 'complete'
                  when lg.draft_status = 'complete' then 'active'
                  when lg.draft_status = 'live' then 'drafting'
                  else 'setup'
                end,
       slug = case when lg.slug is null then 'og' else lg.slug end,
       member_cap = greatest(2, (select count(*) from public.league_members m where m.league_id = lg.id)),
       member_count_locked = case when lg.draft_order is not null then array_length(lg.draft_order, 1) end,
       draft_completed_at = case when lg.draft_status = 'complete'
                                 then (select max(made_at) from public.draft_picks d where d.league_id = lg.id) end;

alter table public.leagues
  alter column slug set not null,
  alter column member_cap set not null,
  add constraint leagues_slug_key unique (slug),
  add constraint leagues_slug_format check (slug ~ '^[a-z0-9-]{2,32}$'),
  add constraint leagues_member_cap_range check (member_cap between 2 and 14),
  drop column draft_status,
  drop column season_complete;

-- ---------------------------------------------------------------------------
-- 6. Members: league role, invite provenance, per-league reveal cursor
-- ---------------------------------------------------------------------------
alter table public.league_members
  add column role text not null default 'member' check (role in ('commissioner','member')),
  add column joined_via uuid,
  add column last_reveal_key text;

update public.league_members lm
   set role = 'commissioner'
  from public.profiles p
 where p.id = lm.user_id and p.role = 'commissioner';

update public.league_members lm
   set last_reveal_key = p.last_reveal_key
  from public.profiles p
 where p.id = lm.user_id and p.last_reveal_key is not null;

update public.leagues lg
   set created_by = (select user_id from public.league_members m where m.league_id = lg.id and m.role = 'commissioner' limit 1)
 where created_by is null;

create unique index one_commissioner_per_league on public.league_members (league_id) where role = 'commissioner';

alter table public.profiles drop column role, drop column last_reveal_key;

-- roster ledger: a member leaving an active league returns their couples to Leftovers
alter table public.roster_events drop constraint roster_events_event_check;
alter table public.roster_events add constraint roster_events_event_check
  check (event in ('drafted','replacement','eliminated','withdrew','departed'));

-- ---------------------------------------------------------------------------
-- 7. Invites, activity, audit
-- ---------------------------------------------------------------------------
create table public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  token text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses int,
  use_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_active_invite_per_league on public.league_invites (league_id) where revoked_at is null;
alter table public.league_members
  add constraint league_members_joined_via_fkey foreign key (joined_via) references public.league_invites(id) on delete set null;

create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  league_id uuid references public.leagues(id) on delete set null,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at);
create index activity_log_league_idx on public.activity_log (league_id, created_at);
create index activity_log_user_idx on public.activity_log (user_id, created_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target jsonb,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at);

-- ---------------------------------------------------------------------------
-- 8. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_commissioner(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner'
  );
$$;

-- Latest season that has show data (35 is only the fallback when nothing is loaded).
create or replace function public.fn_current_season(p_show_id text default 'dwts')
returns int language sql stable set search_path = public as $$
  select coalesce(
    (select max(season) from public.couples where show_id = p_show_id),
    (select max(season) from public.episodes where show_id = p_show_id),
    35);
$$;

create or replace function public.fn_new_invite_token()
returns text language sql volatile set search_path = public as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

-- Every server action writes one row. user_id is always the caller.
create or replace function public.fn_log_activity(p_action text, p_league_id uuid default null, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (user_id, league_id, action, meta) values (auth.uid(), p_league_id, p_action, p_meta);
$$;

-- Internal: platform-admin and commissioner writes leave an audit row.
create or replace function public.fn_audit(p_action text, p_target jsonb, p_before jsonb default null, p_after jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, action, target, before, after) values (auth.uid(), p_action, p_target, p_before, p_after);
$$;

-- Middleware calls this at most once per 10 minutes per user (cookie-throttled).
create or replace function public.fn_touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '10 minutes');
$$;

-- Auth trigger: profile only. League membership now comes from invite links.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Users may edit their own profile, but never the platform columns. Direct client writes run as
-- the `authenticated` role; SECURITY DEFINER functions (and migrations) run as the owner.
create or replace function public.protect_profile_admin_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.is_platform_admin is distinct from old.is_platform_admin
    or new.disabled_at is distinct from old.disabled_at
    or new.is_mock is distinct from old.is_mock) then
    raise exception 'platform columns are read-only';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_admin_cols before update on public.profiles
  for each row execute function public.protect_profile_admin_cols();

-- A member may update their own row (reveal cursor) but never their role or seat.
create or replace function public.protect_member_cols()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (
       new.role is distinct from old.role
    or new.is_player is distinct from old.is_player
    or new.joined_via is distinct from old.joined_via
    or new.joined_at is distinct from old.joined_at
    or new.league_id is distinct from old.league_id
    or new.user_id is distinct from old.user_id) then
    raise exception 'membership columns are read-only';
  end if;
  return new;
end;
$$;
create trigger league_members_protect_cols before update on public.league_members
  for each row execute function public.protect_member_cols();

-- ---------------------------------------------------------------------------
-- 9. Views
-- ---------------------------------------------------------------------------
-- Leftovers per league: active couples of the league's season not on any roster in that league.
create view public.v_leftovers
with (security_invoker = true) as
select lg.id as league_id, c.*
from public.leagues lg
join public.couples c on c.show_id = lg.show_id and c.season = lg.season
where c.status = 'active'
  and not exists (select 1 from public.v_current_rosters r where r.league_id = lg.id and r.couple_id = c.id);

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
       case when next_event in ('eliminated','withdrew','departed') then next_week end as left_week
from ev
where event in ('drafted','replacement');

create view public.v_admin_league_stats
with (security_invoker = true) as
select lg.id, lg.name, lg.slug, lg.status, lg.season, lg.member_cap, lg.member_count_locked, lg.roster_size,
       lg.created_at, lg.draft_completed_at,
       (select count(*)::int from public.league_members m where m.league_id = lg.id) as member_count,
       (select count(*)::int from public.league_members m where m.league_id = lg.id and m.is_player) as player_count,
       (select p.display_name from public.league_members m join public.profiles p on p.id = m.user_id
         where m.league_id = lg.id and m.role = 'commissioner' limit 1) as commissioner_name,
       (select max(a.created_at) from public.activity_log a where a.league_id = lg.id) as last_activity_at,
       (select count(*)::int from public.draft_picks d where d.league_id = lg.id) as picks_made,
       (select count(*)::int from public.replacement_claims c where c.league_id = lg.id and c.status = 'pending') as claims_pending
from public.leagues lg;

create view public.v_admin_platform_stats
with (security_invoker = true) as
select
  (select count(*)::int from public.profiles where not is_mock) as users,
  (select count(*)::int from public.leagues where status = 'setup') as leagues_setup,
  (select count(*)::int from public.leagues where status = 'drafting') as leagues_drafting,
  (select count(*)::int from public.leagues where status = 'active') as leagues_active,
  (select count(*)::int from public.leagues where status = 'complete') as leagues_complete,
  (select count(distinct user_id)::int from public.activity_log where created_at > now() - interval '1 day') as dau,
  (select count(distinct user_id)::int from public.activity_log where created_at > now() - interval '7 days') as wau,
  (select count(distinct user_id)::int from public.activity_log where created_at > now() - interval '30 days') as mau,
  (select count(*)::int from public.leagues where draft_completed_at is not null) as drafts_completed,
  (select count(*)::int from public.replacement_claims where status = 'pending') as claims_pending,
  (select status from public.ingest_runs where status <> 'running' order by started_at desc limit 1) as last_ingest_status,
  (select coalesce(finished_at, started_at) from public.ingest_runs where status <> 'running' order by started_at desc limit 1) as last_ingest_at,
  (select count(*)::int from public.couples where show_id = 'dwts' and season = public.fn_current_season('dwts') and status in ('active','finalist')) as couples_remaining;

-- ---------------------------------------------------------------------------
-- 10. League lifecycle functions
-- ---------------------------------------------------------------------------
create or replace function public.fn_create_league(p_name text, p_slug text, p_member_cap int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_season int;
  v_couples int;
  v_id uuid;
  v_token text;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if exists (select 1 from public.profiles where id = v_uid and disabled_at is not null) then raise exception 'account disabled'; end if;
  if length(trim(p_name)) < 1 or length(trim(p_name)) > 60 then raise exception 'league name must be 1-60 characters'; end if;
  if p_slug !~ '^[a-z0-9-]{2,32}$' then raise exception 'slug must be 2-32 lowercase letters, digits, or dashes'; end if;
  if p_member_cap < 2 or p_member_cap > 14 then raise exception 'league size must be between 2 and 14'; end if;
  if exists (select 1 from public.leagues where slug = p_slug) then raise exception 'that link name is taken'; end if;
  if (select count(*) from public.leagues where created_by = v_uid and status = 'setup') >= 3 then
    raise exception 'you already have 3 leagues waiting to draft';
  end if;

  v_season := public.fn_current_season('dwts');
  select count(*) into v_couples from public.couples where show_id = 'dwts' and season = v_season and status = 'active';
  if v_couples / p_member_cap < 1 then raise exception 'not enough couples for a league that size'; end if;

  insert into public.leagues (name, slug, season, show_id, created_by, status, member_cap, roster_size)
  values (trim(p_name), p_slug, v_season, 'dwts', v_uid, 'setup', p_member_cap, v_couples / p_member_cap)
  returning id into v_id;

  insert into public.league_members (league_id, user_id, role, is_player) values (v_id, v_uid, 'commissioner', true);

  v_token := public.fn_new_invite_token();
  insert into public.league_invites (league_id, token, created_by) values (v_id, v_token, v_uid);

  perform public.fn_log_activity('league.create', v_id, jsonb_build_object('slug', p_slug, 'member_cap', p_member_cap));

  return jsonb_build_object(
    'league_id', v_id, 'slug', p_slug, 'invite_token', v_token,
    'couple_count', v_couples, 'roster_size', v_couples / p_member_cap, 'leftovers', v_couples % p_member_cap);
end;
$$;

-- Commissioner settings. Null = unchanged. Name/cap/pick timer only while setup.
create or replace function public.fn_update_league_settings(
  p_league_id uuid, p_name text default null, p_member_cap int default null,
  p_pick_seconds int default null, p_draft_scheduled_at timestamptz default null, p_clear_schedule boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_members int;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;

  if p_name is not null then
    if v_league.status <> 'setup' then raise exception 'name is locked once the draft starts'; end if;
    if length(trim(p_name)) < 1 or length(trim(p_name)) > 60 then raise exception 'league name must be 1-60 characters'; end if;
    update public.leagues set name = trim(p_name) where id = p_league_id;
  end if;
  if p_member_cap is not null then
    if v_league.status <> 'setup' then raise exception 'league size is locked once the draft starts'; end if;
    if p_member_cap < 2 or p_member_cap > 14 then raise exception 'league size must be between 2 and 14'; end if;
    select count(*) into v_members from public.league_members where league_id = p_league_id;
    if p_member_cap < v_members then raise exception 'league size cannot be below the current member count (%)', v_members; end if;
    update public.leagues set member_cap = p_member_cap where id = p_league_id;
  end if;
  if p_pick_seconds is not null then
    if v_league.status <> 'setup' then raise exception 'pick timer is locked once the draft starts'; end if;
    if p_pick_seconds < 15 or p_pick_seconds > 600 then raise exception 'pick timer must be 15-600 seconds'; end if;
    update public.leagues set pick_seconds = p_pick_seconds where id = p_league_id;
  end if;
  if p_clear_schedule then
    update public.leagues set draft_scheduled_at = null where id = p_league_id;
  elsif p_draft_scheduled_at is not null then
    update public.leagues set draft_scheduled_at = p_draft_scheduled_at where id = p_league_id;
  end if;

  perform public.fn_log_activity('league.settings', p_league_id, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- What /join/[token] shows before (and after) sign-in. Safe for anon: name + seat count only.
create or replace function public.fn_invite_preview(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv public.league_invites%rowtype;
  v_league public.leagues%rowtype;
  v_members int;
  v_member boolean := false;
begin
  select * into v_inv from public.league_invites where token = p_token;
  if not found then return jsonb_build_object('valid', false, 'reason', 'This invite is no longer valid.'); end if;
  select * into v_league from public.leagues where id = v_inv.league_id;
  select count(*) into v_members from public.league_members where league_id = v_league.id;
  if auth.uid() is not null then
    v_member := exists (select 1 from public.league_members where league_id = v_league.id and user_id = auth.uid());
  end if;

  if v_member then
    return jsonb_build_object('valid', true, 'already_member', true, 'name', v_league.name, 'slug', v_league.slug,
                              'status', v_league.status, 'joined', v_members, 'cap', v_league.member_cap);
  end if;
  if v_inv.revoked_at is not null then return jsonb_build_object('valid', false, 'reason', 'This invite is no longer valid.'); end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'This invite has expired.'); end if;
  if v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses then return jsonb_build_object('valid', false, 'reason', 'This invite has been used up.'); end if;
  if v_league.status <> 'setup' then return jsonb_build_object('valid', false, 'reason', 'Draft has started.', 'name', v_league.name); end if;
  if v_members >= v_league.member_cap then return jsonb_build_object('valid', false, 'reason', 'League is full.', 'name', v_league.name); end if;

  return jsonb_build_object('valid', true, 'already_member', false, 'name', v_league.name, 'slug', v_league.slug,
                            'status', v_league.status, 'joined', v_members, 'cap', v_league.member_cap);
end;
$$;

create or replace function public.fn_join_league(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.league_invites%rowtype;
  v_league public.leagues%rowtype;
  v_members int;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if exists (select 1 from public.profiles where id = v_uid and disabled_at is not null) then raise exception 'account disabled'; end if;

  select * into v_inv from public.league_invites where token = p_token for update;
  if not found then raise exception 'This invite is no longer valid.'; end if;
  select * into v_league from public.leagues where id = v_inv.league_id for update;

  -- an existing member following the link is just redirected
  if exists (select 1 from public.league_members where league_id = v_league.id and user_id = v_uid) then
    return jsonb_build_object('slug', v_league.slug, 'joined', false, 'already_member', true);
  end if;

  if v_inv.revoked_at is not null then raise exception 'This invite is no longer valid.'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then raise exception 'This invite has expired.'; end if;
  if v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses then raise exception 'This invite has been used up.'; end if;
  if v_league.status <> 'setup' then raise exception 'Draft has started.'; end if;
  select count(*) into v_members from public.league_members where league_id = v_league.id;
  if v_members >= v_league.member_cap then raise exception 'League is full.'; end if;

  insert into public.league_members (league_id, user_id, role, is_player, joined_via)
  values (v_league.id, v_uid, 'member', true, v_inv.id);
  update public.league_invites set use_count = use_count + 1 where id = v_inv.id;
  perform public.fn_log_activity('league.join', v_league.id, jsonb_build_object('invite_id', v_inv.id));

  return jsonb_build_object('slug', v_league.slug, 'joined', true, 'already_member', false);
end;
$$;

create or replace function public.fn_regenerate_invite(p_league_id uuid, p_expires_at timestamptz default null, p_max_uses int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'max uses must be at least 1'; end if;
  update public.league_invites set revoked_at = now() where league_id = p_league_id and revoked_at is null;
  v_token := public.fn_new_invite_token();
  insert into public.league_invites (league_id, token, created_by, expires_at, max_uses)
  values (p_league_id, v_token, auth.uid(), p_expires_at, p_max_uses);
  perform public.fn_log_activity('invite.regenerate', p_league_id, null);
  return jsonb_build_object('token', v_token);
end;
$$;

create or replace function public.fn_revoke_invite(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  update public.league_invites set revoked_at = now() where league_id = p_league_id and revoked_at is null;
  perform public.fn_log_activity('invite.revoke', p_league_id, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Internal: a user leaves an active league; their couples return to Leftovers.
create or replace function public.fn_depart_member(p_league_id uuid, p_user_id uuid, p_source text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_week int;
  v_n int;
begin
  select * into v_league from public.leagues where id = p_league_id;
  v_week := public.fn_next_week(v_league.season);
  insert into public.roster_events (league_id, user_id, couple_id, event, week, source)
  select r.league_id, r.user_id, r.couple_id, 'departed', v_week, p_source
    from public.v_current_rosters r
   where r.league_id = p_league_id and r.user_id = p_user_id;
  get diagnostics v_n = row_count;
  update public.replacement_claims set status = 'void', resolved_at = now()
   where league_id = p_league_id and user_id = p_user_id and status = 'pending';
  return v_n;
end;
$$;

-- Setup-status leagues: seat reopens.
create or replace function public.fn_remove_member(p_league_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  if p_user_id = auth.uid() then raise exception 'transfer the commissioner role before leaving'; end if;
  select status into v_status from public.leagues where id = p_league_id for update;
  if v_status <> 'setup' then raise exception 'use remove-active-member once the draft has started'; end if;
  delete from public.league_members where league_id = p_league_id and user_id = p_user_id;
  if not found then raise exception 'not a member'; end if;
  perform public.fn_log_activity('member.remove', p_league_id, jsonb_build_object('user_id', p_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- Active leagues: couples go to Leftovers via 'departed' events. Not allowed mid-draft.
create or replace function public.fn_commissioner_remove_active_member(p_league_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_n int;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  if p_user_id = auth.uid() then raise exception 'transfer the commissioner role before leaving'; end if;
  select status into v_status from public.leagues where id = p_league_id for update;
  if v_status = 'setup' then raise exception 'use remove-member while the league is in setup'; end if;
  if v_status = 'drafting' then raise exception 'cannot remove a member mid-draft; reset the draft first'; end if;
  if not exists (select 1 from public.league_members where league_id = p_league_id and user_id = p_user_id) then
    raise exception 'not a member';
  end if;
  v_n := public.fn_depart_member(p_league_id, p_user_id, 'admin');
  delete from public.league_members where league_id = p_league_id and user_id = p_user_id;
  perform public.fn_audit('commissioner.remove_active_member',
    jsonb_build_object('league_id', p_league_id, 'user_id', p_user_id), null, jsonb_build_object('couples_released', v_n));
  perform public.fn_log_activity('member.remove_active', p_league_id, jsonb_build_object('user_id', p_user_id, 'couples_released', v_n));
  return jsonb_build_object('ok', true, 'couples_released', v_n);
end;
$$;

create or replace function public.fn_transfer_commissioner(p_league_id uuid, p_to_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  if p_to_user_id = auth.uid() then raise exception 'already the commissioner'; end if;
  if not exists (select 1 from public.league_members where league_id = p_league_id and user_id = p_to_user_id) then
    raise exception 'that user is not a member of this league';
  end if;
  perform 1 from public.leagues where id = p_league_id for update;
  -- demote first: the partial unique index allows exactly one commissioner at any instant
  update public.league_members set role = 'member' where league_id = p_league_id and user_id = auth.uid();
  update public.league_members set role = 'commissioner' where league_id = p_league_id and user_id = p_to_user_id;
  perform public.fn_log_activity('league.transfer', p_league_id, jsonb_build_object('to', p_to_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_leave_league(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_status text;
  v_n int := 0;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  select role into v_role from public.league_members where league_id = p_league_id and user_id = v_uid;
  if v_role is null then raise exception 'not a member'; end if;
  if v_role = 'commissioner' then raise exception 'transfer the commissioner role before leaving'; end if;
  select status into v_status from public.leagues where id = p_league_id for update;
  if v_status = 'drafting' then raise exception 'cannot leave mid-draft'; end if;
  if v_status in ('active','complete') then v_n := public.fn_depart_member(p_league_id, v_uid, 'admin'); end if;
  delete from public.league_members where league_id = p_league_id and user_id = v_uid;
  perform public.fn_log_activity('league.leave', p_league_id, jsonb_build_object('couples_released', v_n));
  return jsonb_build_object('ok', true, 'couples_released', v_n);
end;
$$;

create or replace function public.fn_delete_league(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select status into v_status from public.leagues where id = p_league_id for update;
  if v_status <> 'setup' then raise exception 'only a league that has not drafted can be deleted'; end if;
  perform public.fn_log_activity('league.delete', p_league_id, null);
  delete from public.leagues where id = p_league_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Account deletion (§6). The auth.users row is removed afterwards by a service-role server action.
create or replace function public.fn_delete_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_m record;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if exists (
    select 1 from public.league_members m join public.leagues lg on lg.id = m.league_id
    where m.user_id = v_uid and m.role = 'commissioner'
      and (lg.status in ('setup','drafting') or (select count(*) from public.league_members x where x.league_id = lg.id) > 1)
  ) then
    raise exception 'transfer the commissioner role in your leagues first';
  end if;

  for v_m in select m.league_id, m.role, lg.status from public.league_members m join public.leagues lg on lg.id = m.league_id where m.user_id = v_uid loop
    if v_m.role = 'commissioner' then
      -- sole member of a league: setup → delete it; otherwise just leave
      if v_m.status = 'setup' then
        delete from public.leagues where id = v_m.league_id;
        continue;
      end if;
    end if;
    if v_m.status in ('active','complete') then perform public.fn_depart_member(v_m.league_id, v_uid, 'admin'); end if;
    delete from public.league_members where league_id = v_m.league_id and user_id = v_uid;
  end loop;

  perform public.fn_log_activity('account.delete', null, null);
  update public.profiles set display_name = 'Departed user', avatar_url = null, disabled_at = now() where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Draft functions (league-scoped; couples shared)
-- ---------------------------------------------------------------------------
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
       set current_pick = v_pick_no, status = 'active', turn_started_at = null, draft_completed_at = now()
     where id = p_league.id;
  else
    update public.leagues
       set current_pick = v_pick_no, turn_started_at = now()
     where id = p_league.id;
  end if;
end;
$$;

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
    if not (v_league.is_mock and public.is_commissioner(p_league_id)
            and exists (select 1 from public.profiles where id = p_user_id and is_mock)) then
      raise exception 'cannot pick for another user';
    end if;
  end if;

  if v_league.status <> 'drafting' then raise exception 'draft is not live'; end if;

  v_owner := public.fn_pick_owner(v_league.draft_order, v_league.current_pick + 1);
  if v_owner <> p_user_id then raise exception 'not your turn'; end if;

  select * into v_couple from public.couples
   where id = p_couple_id and show_id = v_league.show_id and season = v_league.season for update;
  if not found then raise exception 'couple not found'; end if;
  if v_couple.status <> 'active' then raise exception 'couple is not active'; end if;
  if exists (select 1 from public.draft_picks where league_id = p_league_id and couple_id = p_couple_id) then
    raise exception 'couple already drafted';
  end if;

  perform public.fn_commit_pick(v_league, p_user_id, p_couple_id, false);
  return jsonb_build_object('ok', true, 'pick_no', v_league.current_pick + 1);
end;
$$;

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
    where status = 'drafting'
      and turn_started_at is not null
      and now() > turn_started_at + make_interval(secs => pick_seconds)
    for update skip locked
  loop
    v_owner := public.fn_pick_owner(v_league.draft_order, v_league.current_pick + 1);
    select c.id into v_couple_id
      from public.couples c
     where c.show_id = v_league.show_id and c.season = v_league.season and c.status = 'active'
       and not exists (select 1 from public.draft_picks d where d.league_id = v_league.id and d.couple_id = c.id)
     order by c.cast_order asc
     limit 1;
    if v_couple_id is null then
      update public.leagues set status = 'active', turn_started_at = null, draft_completed_at = now() where id = v_league.id;
    else
      perform public.fn_commit_pick(v_league, v_owner, v_couple_id, true);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Start the draft. If fewer players than the cap, the caller must confirm (p_confirm_short) and the
-- cap locks to the actual count. roster_size = floor(active couples / players).
create or replace function public.fn_start_draft(p_league_id uuid, p_seed text default null, p_confirm_short boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_seed text := coalesce(p_seed, gen_random_uuid()::text);
  v_order uuid[];
  v_couples int;
  v_players int;
  v_roster int;
begin
  if auth.uid() is not null and not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if v_league.status <> 'setup' then raise exception 'draft already started'; end if;

  select count(*) into v_players from public.league_members where league_id = p_league_id and is_player;
  if v_players < 2 then raise exception 'need at least 2 drafting members'; end if;
  if v_players < v_league.member_cap and not p_confirm_short then
    raise exception 'short:%:%', v_players, v_league.member_cap;
  end if;

  select count(*) into v_couples from public.couples
   where show_id = v_league.show_id and season = v_league.season and status = 'active';
  v_roster := v_couples / v_players;
  if v_roster < 1 then raise exception 'not enough couples for % players', v_players; end if;

  select array_agg(user_id order by md5(v_seed || user_id::text))
    into v_order
    from public.league_members where league_id = p_league_id and is_player;

  update public.league_invites set revoked_at = now() where league_id = p_league_id and revoked_at is null;

  update public.leagues
     set draft_order = v_order, draft_rng_seed = v_seed, status = 'drafting',
         member_cap = least(member_cap, greatest(2, v_players)),
         member_count_locked = v_players, roster_size = v_roster,
         current_pick = 0, turn_started_at = now(), draft_completed_at = null
   where id = p_league_id;

  perform public.fn_log_activity('draft.start', p_league_id, jsonb_build_object('players', v_players, 'roster_size', v_roster));
  return jsonb_build_object('ok', true, 'order', to_jsonb(v_order), 'seed', v_seed, 'roster_size', v_roster);
end;
$$;

create or replace function public.fn_reset_draft(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
begin
  if auth.uid() is not null and not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if v_league.is_mock then raise exception 'league is in mock mode; use End mock draft'; end if;
  if v_league.status <> 'drafting' then raise exception 'no draft in progress'; end if;
  if exists (select 1 from public.roster_events where league_id = p_league_id and source <> 'draft') then
    raise exception 'season has roster activity; cannot reset';
  end if;
  delete from public.roster_events where league_id = p_league_id and source = 'draft';
  delete from public.draft_picks where league_id = p_league_id;
  update public.leagues
     set status = 'setup', draft_order = null, draft_rng_seed = null,
         member_count_locked = null, current_pick = 0, turn_started_at = null
   where id = p_league_id;
  perform public.fn_log_activity('draft.reset', p_league_id, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- Mock draft: top the league up to the cap with proxy members, then start.
create or replace function public.fn_start_mock_draft(p_league_id uuid, p_total int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_players int;
  v_target int;
  v_uid uuid;
  i int;
begin
  if auth.uid() is not null and not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if v_league.status <> 'setup' then raise exception 'draft already started'; end if;
  if exists (select 1 from public.roster_events where league_id = p_league_id) then
    raise exception 'league already has roster history';
  end if;

  v_target := least(coalesce(p_total, v_league.member_cap), v_league.member_cap);
  select count(*) into v_players from public.league_members where league_id = p_league_id and is_player;
  for i in 1..greatest(0, v_target - v_players) loop
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
    insert into public.league_members (league_id, user_id, role, is_player) values (p_league_id, v_uid, 'member', true) on conflict do nothing;
  end loop;

  update public.leagues set is_mock = true where id = p_league_id;
  return public.fn_start_draft(p_league_id, 'mock-' || gen_random_uuid()::text, true);
end;
$$;

-- End a mock: wipe this league's picks/events/claims, remove proxies, back to setup.
-- Couples are shared show data now, so a mock never touches them and results cannot be entered in mock mode.
create or replace function public.fn_end_mock_draft(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_mocks uuid[];
begin
  if auth.uid() is not null and not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found then raise exception 'league not found'; end if;
  if not v_league.is_mock then raise exception 'league is not in mock mode'; end if;

  select coalesce(array_agg(p.id), '{}') into v_mocks
    from public.profiles p join public.league_members lm on lm.user_id = p.id and lm.league_id = p_league_id
   where p.is_mock;

  delete from public.replacement_claims where league_id = p_league_id;
  delete from public.roster_events where league_id = p_league_id;
  delete from public.draft_picks where league_id = p_league_id;
  delete from auth.users where id = any(v_mocks);
  delete from public.profiles where id = any(v_mocks);

  update public.leagues
     set status = 'setup', draft_order = null, draft_rng_seed = null, member_count_locked = null,
         current_pick = 0, turn_started_at = null, draft_completed_at = null, is_mock = false
   where id = p_league_id;

  perform public.fn_log_activity('draft.end_mock', p_league_id, jsonb_build_object('proxies_removed', coalesce(array_length(v_mocks, 1), 0)));
  return jsonb_build_object('ok', true, 'proxies_removed', coalesce(array_length(v_mocks, 1), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Results: one couples update, fan out to every league in the season
-- ---------------------------------------------------------------------------
-- Internal: a couple leaves its owner's roster in one league and the owner gets a claim.
create or replace function public.fn_release_couple(p_league public.leagues, p_couple_id uuid, p_event text, p_week int, p_source text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_queue int;
  v_has_leftovers boolean;
begin
  select user_id into v_owner from public.v_current_rosters where league_id = p_league.id and couple_id = p_couple_id;
  if v_owner is null then return 0; end if;

  insert into public.roster_events (league_id, user_id, couple_id, event, week, source)
  values (p_league.id, v_owner, p_couple_id, p_event, coalesce(p_week, 0), p_source);

  select exists (select 1 from public.v_leftovers l where l.league_id = p_league.id) into v_has_leftovers;
  select coalesce(max(queue_pos), 0) + 1 into v_queue from public.replacement_claims where league_id = p_league.id;
  insert into public.replacement_claims (league_id, user_id, lost_couple_id, queue_pos, status, deadline)
  values (p_league.id, v_owner, p_couple_id, v_queue,
          case when v_has_leftovers then 'pending' else 'void' end,
          case when v_has_leftovers then public.fn_next_claim_deadline(p_league.season) end);
  return 1;
end;
$$;

-- p_diff: jsonb array of { couple_id, status, elimination_week, elimination_date, placement } in elimination order.
-- Only active→eliminated|withdrew|finalist and placements apply; un-eliminating needs p_allow_revert (platform admin).
create or replace function public.fn_apply_results(p_diff jsonb, p_source text default 'ingest', p_run_id uuid default null, p_allow_revert boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_couple public.couples%rowtype;
  v_league public.leagues%rowtype;
  v_new_status text;
  v_week int;
  v_placement int;
  v_date date;
  v_applied int := 0;
  v_claims int := 0;
  v_changes jsonb := '[]'::jsonb;
begin
  if p_source not in ('ingest','admin') then raise exception 'bad source'; end if;
  if auth.uid() is not null and not public.is_platform_admin() then raise exception 'platform admin only'; end if;

  for v_item in select * from jsonb_array_elements(p_diff) loop
    select * into v_couple from public.couples where id = (v_item->>'couple_id')::uuid for update;
    if not found then raise exception 'couple % not found', v_item->>'couple_id'; end if;

    v_new_status := coalesce(v_item->>'status', v_couple.status);
    v_week := coalesce((v_item->>'elimination_week')::int, v_couple.elimination_week);
    v_placement := coalesce((v_item->>'placement')::int, v_couple.placement);
    v_date := coalesce((v_item->>'elimination_date')::date, v_couple.elimination_date);
    if v_new_status not in ('active','eliminated','withdrew','finalist') then raise exception 'bad status %', v_new_status; end if;

    -- revert guard (Wikipedia vandalism / admin undo)
    if v_couple.status in ('eliminated','withdrew') and v_new_status in ('active','finalist') then
      if not p_allow_revert then raise exception 'refusing to un-eliminate % (needs_review)', v_couple.celebrity; end if;
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
       set status = v_new_status, elimination_week = v_week, elimination_date = v_date, placement = v_placement, updated_at = now()
     where id = v_couple.id;

    v_changes := v_changes || jsonb_build_object(
      'couple_id', v_couple.id, 'celebrity', v_couple.celebrity,
      'from', v_couple.status, 'to', v_new_status, 'week', v_week, 'placement', v_placement);
    v_applied := v_applied + 1;

    if p_run_id is not null then
      insert into public.results_events (run_id, couple_id, change)
      values (p_run_id, v_couple.id, v_changes -> (jsonb_array_length(v_changes) - 1));
    end if;

    -- fan out: every league in this season that has drafted (or is drafting)
    if v_couple.status in ('active','finalist') and v_new_status in ('eliminated','withdrew') then
      for v_league in
        select * from public.leagues
         where show_id = v_couple.show_id and season = v_couple.season and status in ('active','drafting')
         order by created_at
         for update
      loop
        v_claims := v_claims + public.fn_release_couple(v_league, v_couple.id, v_new_status, v_week, p_source);
      end loop;
    end if;
  end loop;

  -- Finale: every couple placed and a winner recorded → leagues in that season complete.
  update public.leagues lg
     set status = 'complete'
   where lg.status in ('active','drafting')
     and exists (select 1 from public.couples c where c.show_id = lg.show_id and c.season = lg.season and c.placement = 1)
     and not exists (select 1 from public.couples c where c.show_id = lg.show_id and c.season = lg.season
                       and c.status in ('active','finalist') and c.placement is null);

  return jsonb_build_object('applied', v_applied, 'claims', v_claims, 'changes', v_changes);
end;
$$;

-- Commissioner: league-scoped roster override. Never touches couples. Audited.
--   event 'eliminated' | 'withdrew' → couple leaves its owner's roster in this league (+ claim)
--   event 'restore'                → undo those league-scoped events for this couple, void its claims
create or replace function public.fn_commissioner_override(p_league_id uuid, p_couple_id uuid, p_event text, p_week int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues%rowtype;
  v_n int := 0;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  select * into v_league from public.leagues where id = p_league_id for update;
  if v_league.status not in ('active','complete') then raise exception 'league has not drafted'; end if;
  if not exists (select 1 from public.couples where id = p_couple_id and show_id = v_league.show_id and season = v_league.season) then
    raise exception 'couple is not in this season';
  end if;

  if p_event in ('eliminated','withdrew') then
    v_n := public.fn_release_couple(v_league, p_couple_id, p_event, coalesce(p_week, public.fn_next_week(v_league.season) - 1), 'admin');
    if v_n = 0 then raise exception 'couple is not on a roster in this league'; end if;
  elsif p_event = 'restore' then
    delete from public.roster_events where league_id = p_league_id and couple_id = p_couple_id and event in ('eliminated','withdrew');
    get diagnostics v_n = row_count;
    update public.replacement_claims set status = 'void', resolved_at = now()
     where league_id = p_league_id and lost_couple_id = p_couple_id and status = 'pending';
  else
    raise exception 'bad event %', p_event;
  end if;

  perform public.fn_audit('commissioner.override', jsonb_build_object('league_id', p_league_id, 'couple_id', p_couple_id),
                          null, jsonb_build_object('event', p_event, 'week', p_week, 'rows', v_n));
  perform public.fn_log_activity('results.override', p_league_id, jsonb_build_object('couple_id', p_couple_id, 'event', p_event));
  return jsonb_build_object('ok', true, 'rows', v_n);
end;
$$;

create or replace function public.fn_commissioner_void_claim(p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_claim public.replacement_claims%rowtype;
begin
  select * into v_claim from public.replacement_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  if not public.is_commissioner(v_claim.league_id) then raise exception 'commissioner only'; end if;
  if v_claim.status <> 'pending' then raise exception 'claim is %', v_claim.status; end if;
  update public.replacement_claims set status = 'void', resolved_at = now() where id = p_claim_id;
  perform public.fn_audit('commissioner.void_claim', jsonb_build_object('league_id', v_claim.league_id, 'claim_id', p_claim_id), to_jsonb(v_claim), null);
  perform public.fn_log_activity('claim.void', v_claim.league_id, jsonb_build_object('claim_id', p_claim_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- p_claim_ids: every pending claim of the league in the desired order.
create or replace function public.fn_commissioner_reorder_claims(p_league_id uuid, p_claim_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pending int;
begin
  if not public.is_commissioner(p_league_id) then raise exception 'commissioner only'; end if;
  perform 1 from public.leagues where id = p_league_id for update;
  select count(*) into v_pending from public.replacement_claims where league_id = p_league_id and status = 'pending';
  if v_pending <> coalesce(array_length(p_claim_ids, 1), 0)
     or exists (select 1 from unnest(p_claim_ids) x(id) where not exists
                (select 1 from public.replacement_claims c where c.id = x.id and c.league_id = p_league_id and c.status = 'pending')) then
    raise exception 'claim list must contain exactly the pending claims of this league';
  end if;
  update public.replacement_claims c
     set queue_pos = x.ord
    from unnest(p_claim_ids) with ordinality as x(id, ord)
   where c.id = x.id;
  perform public.fn_audit('commissioner.reorder_claims', jsonb_build_object('league_id', p_league_id), null, to_jsonb(p_claim_ids));
  perform public.fn_log_activity('claim.reorder', p_league_id, null);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Platform admin functions (each writes audit_log)
-- ---------------------------------------------------------------------------
create or replace function public.fn_admin_set_couple_status(
  p_couple_id uuid, p_status text, p_elimination_week int default null, p_elimination_date date default null, p_placement int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before public.couples%rowtype;
  v_res jsonb;
  v_diff jsonb;
begin
  if not public.is_platform_admin() then raise exception 'platform admin only'; end if;
  select * into v_before from public.couples where id = p_couple_id;
  if not found then raise exception 'couple not found'; end if;
  v_diff := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'couple_id', p_couple_id, 'status', p_status, 'elimination_week', p_elimination_week,
    'elimination_date', p_elimination_date, 'placement', p_placement)));
  v_res := public.fn_apply_results(v_diff, 'admin', null, p_status in ('active','finalist'));
  perform public.fn_audit('admin.set_couple_status', jsonb_build_object('table', 'couples', 'id', p_couple_id),
                          to_jsonb(v_before), (select to_jsonb(c) from public.couples c where c.id = p_couple_id));
  perform public.fn_log_activity('admin.results', null, jsonb_build_object('couple_id', p_couple_id, 'status', p_status));
  return v_res;
end;
$$;

create or replace function public.fn_admin_force_ingest_apply(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run public.ingest_runs%rowtype;
  v_res jsonb;
begin
  if not public.is_platform_admin() then raise exception 'platform admin only'; end if;
  select * into v_run from public.ingest_runs where id = p_run_id for update;
  if not found then raise exception 'run not found'; end if;
  if v_run.status <> 'needs_review' or v_run.diff is null then raise exception 'run is not awaiting review'; end if;
  v_res := public.fn_apply_results(v_run.diff, 'admin', p_run_id, true);
  update public.ingest_runs set status = 'ok', finished_at = now(), error = null where id = p_run_id;
  perform public.fn_audit('admin.force_ingest_apply', jsonb_build_object('table', 'ingest_runs', 'id', p_run_id), to_jsonb(v_run), v_res);
  return v_res;
end;
$$;

create or replace function public.fn_admin_dismiss_ingest_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_run public.ingest_runs%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'platform admin only'; end if;
  select * into v_run from public.ingest_runs where id = p_run_id for update;
  if not found then raise exception 'run not found'; end if;
  if v_run.status <> 'needs_review' then raise exception 'run is not awaiting review'; end if;
  update public.ingest_runs set status = 'no_change', finished_at = coalesce(finished_at, now()) where id = p_run_id;
  perform public.fn_audit('admin.dismiss_ingest_run', jsonb_build_object('table', 'ingest_runs', 'id', p_run_id), to_jsonb(v_run), null);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_admin_revoke_invite(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not public.is_platform_admin() then raise exception 'platform admin only'; end if;
  update public.league_invites set revoked_at = now() where league_id = p_league_id and revoked_at is null;
  get diagnostics v_n = row_count;
  perform public.fn_audit('admin.revoke_invite', jsonb_build_object('table', 'league_invites', 'league_id', p_league_id), null, jsonb_build_object('revoked', v_n));
  return jsonb_build_object('ok', true, 'revoked', v_n);
end;
$$;

-- Cast editor (order + photo). Couples are shared, so this is platform-level.
create or replace function public.fn_admin_update_couple(p_couple_id uuid, p_cast_order int default null, p_image_url text default null, p_clear_image boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before public.couples%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'platform admin only'; end if;
  select * into v_before from public.couples where id = p_couple_id for update;
  if not found then raise exception 'couple not found'; end if;
  if p_cast_order is not null then update public.couples set cast_order = p_cast_order, updated_at = now() where id = p_couple_id; end if;
  if p_clear_image then update public.couples set image_url = null, updated_at = now() where id = p_couple_id;
  elsif p_image_url is not null then update public.couples set image_url = p_image_url, updated_at = now() where id = p_couple_id; end if;
  perform public.fn_audit('admin.update_couple', jsonb_build_object('table', 'couples', 'id', p_couple_id),
                          to_jsonb(v_before), (select to_jsonb(c) from public.couples c where c.id = p_couple_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.fn_admin_set_user_disabled(p_user_id uuid, p_disabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'platform admin only'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot disable yourself'; end if;
  update public.profiles set disabled_at = case when p_disabled then now() end where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
  perform public.fn_audit('admin.set_user_disabled', jsonb_build_object('table', 'profiles', 'id', p_user_id), null, jsonb_build_object('disabled', p_disabled));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. RLS: membership policies replace the allowlist
-- ---------------------------------------------------------------------------
alter table public.shows enable row level security;
alter table public.league_invites enable row level security;
alter table public.activity_log enable row level security;
alter table public.audit_log enable row level security;

create policy shows_select on public.shows for select to authenticated using (true);

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy leagues_select on public.leagues for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());

create policy league_members_select on public.league_members for select to authenticated
  using (public.is_member(league_id) or public.is_platform_admin());
-- own row only (reveal cursor); protect_member_cols() keeps role/seat immutable
create policy league_members_update_own on public.league_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy league_invites_select on public.league_invites for select to authenticated
  using (public.is_commissioner(league_id) or public.is_platform_admin());

-- public show data
create policy couples_select on public.couples for select to authenticated using (true);
create policy episodes_select on public.episodes for select to authenticated using (true);
create policy episodes_admin_write on public.episodes for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy judge_scores_select on public.judge_scores for select to authenticated using (true);

-- ledgers: read for members; writes only via SECURITY DEFINER functions
create policy draft_picks_select on public.draft_picks for select to authenticated
  using (public.is_member(league_id) or public.is_platform_admin());
create policy roster_events_select on public.roster_events for select to authenticated
  using (public.is_member(league_id) or public.is_platform_admin());
create policy claims_select on public.replacement_claims for select to authenticated
  using (public.is_member(league_id) or public.is_platform_admin());

create policy ingest_runs_select on public.ingest_runs for select to authenticated using (public.is_platform_admin());
create policy results_events_select on public.results_events for select to authenticated using (public.is_platform_admin());

create policy activity_log_insert_own on public.activity_log for insert to authenticated with check (user_id = auth.uid());
create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_platform_admin() or (league_id is not null and public.is_commissioner(league_id)));
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 15. Grants (0002's default privileges already strip anon/public; be explicit anyway)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_commissioner(uuid) to authenticated;
grant execute on function public.fn_current_season(text) to authenticated, anon;
grant execute on function public.fn_invite_preview(text) to authenticated, anon;
grant execute on function public.fn_log_activity(text, uuid, jsonb) to authenticated;
grant execute on function public.fn_touch_last_seen() to authenticated;
grant execute on function public.fn_create_league(text, text, int) to authenticated;
grant execute on function public.fn_update_league_settings(uuid, text, int, int, timestamptz, boolean) to authenticated;
grant execute on function public.fn_join_league(text) to authenticated;
grant execute on function public.fn_regenerate_invite(uuid, timestamptz, int) to authenticated;
grant execute on function public.fn_revoke_invite(uuid) to authenticated;
grant execute on function public.fn_remove_member(uuid, uuid) to authenticated;
grant execute on function public.fn_commissioner_remove_active_member(uuid, uuid) to authenticated;
grant execute on function public.fn_transfer_commissioner(uuid, uuid) to authenticated;
grant execute on function public.fn_leave_league(uuid) to authenticated;
grant execute on function public.fn_delete_league(uuid) to authenticated;
grant execute on function public.fn_delete_account() to authenticated;
grant execute on function public.fn_make_pick(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_start_draft(uuid, text, boolean) to authenticated;
grant execute on function public.fn_reset_draft(uuid) to authenticated;
grant execute on function public.fn_start_mock_draft(uuid, int) to authenticated;
grant execute on function public.fn_end_mock_draft(uuid) to authenticated;
grant execute on function public.fn_apply_results(jsonb, text, uuid, boolean) to authenticated;
grant execute on function public.fn_fulfill_claim(uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_commissioner_override(uuid, uuid, text, int) to authenticated;
grant execute on function public.fn_commissioner_void_claim(uuid) to authenticated;
grant execute on function public.fn_commissioner_reorder_claims(uuid, uuid[]) to authenticated;
grant execute on function public.fn_admin_set_couple_status(uuid, text, int, date, int) to authenticated;
grant execute on function public.fn_admin_force_ingest_apply(uuid) to authenticated;
grant execute on function public.fn_admin_dismiss_ingest_run(uuid) to authenticated;
grant execute on function public.fn_admin_revoke_invite(uuid) to authenticated;
grant execute on function public.fn_admin_update_couple(uuid, int, text, boolean) to authenticated;
grant execute on function public.fn_admin_set_user_disabled(uuid, boolean) to authenticated;
grant execute on function public.fn_pick_owner(uuid[], int) to authenticated;
grant execute on function public.fn_next_claim_deadline(int) to authenticated;
grant execute on function public.fn_next_week(int) to authenticated;
-- internal only
revoke execute on function public.fn_commit_pick(public.leagues, uuid, uuid, boolean) from authenticated;
revoke execute on function public.fn_release_couple(public.leagues, uuid, text, int, text) from authenticated;
revoke execute on function public.fn_depart_member(uuid, uuid, text) from authenticated;
revoke execute on function public.fn_audit(text, jsonb, jsonb, jsonb) from authenticated;
revoke execute on function public.fn_new_invite_token() from authenticated;
revoke execute on function public.fn_expire_overdue_pick() from authenticated;
revoke execute on function public.fn_expire_claims() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.protect_profile_admin_cols() from authenticated;
revoke execute on function public.protect_member_cols() from authenticated;

-- Realtime: the commissioner's seat map and the draft room
alter publication supabase_realtime add table public.league_members;

-- ---------------------------------------------------------------------------
-- 16. Verify League 1 survived byte-for-byte in meaning, else roll everything back
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_n int;
  v_fp text;
begin
  for r in select * from mig_fp loop
    if r.t = 'draft_picks' then
      select count(*), md5(coalesce(string_agg(couple_id::text || user_id::text || round::text, ',' order by pick_no), ''))
        into v_n, v_fp from public.draft_picks;
    else
      select count(*), md5(coalesce(string_agg(couple_id::text || user_id::text || event || week::text, ',' order by created_at, id), ''))
        into v_n, v_fp from public.roster_events;
    end if;
    if v_n <> r.n or v_fp <> r.fp then
      raise exception 'fingerprint changed for % (before %/%, after %/%) — rolling back', r.t, r.n, r.fp, v_n, v_fp;
    end if;
    raise notice 'fingerprint ok: % rows=% md5=%', r.t, v_n, v_fp;
  end loop;
  if not exists (select 1 from public.leagues where slug = 'og' and status = 'active' and member_cap = 5 and member_count_locked = 4 and roster_size = 4) then
    raise exception 'league 1 backfill unexpected';
  end if;
  if (select count(*) from public.league_members where role = 'commissioner') <> (select count(*) from public.leagues) then
    raise exception 'every league needs exactly one commissioner';
  end if;
end $$;

commit;
