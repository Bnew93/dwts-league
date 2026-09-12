-- 0004_allowed_emails_user_id.sql
-- Track which allowlisted email has signed in (set by handle_new_user), so the
-- admin page can show "signed in" without reading auth.users.

alter table public.allowed_emails add column user_id uuid references public.profiles(id) on delete set null;

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
    update public.allowed_emails set user_id = new.id where email = v_allow.email;
  end if;

  return new;
end;
$$;

-- backfill existing sign-ins
update public.allowed_emails a
   set user_id = u.id
  from auth.users u
 where lower(u.email) = a.email and a.user_id is null;
