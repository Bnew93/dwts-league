-- 0012_claim_membership.sql — join the league on a later sign-in if the email was
-- allowlisted AFTER the account was first created (handle_new_user only runs once).
create or replace function public.fn_claim_membership()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_allow public.allowed_emails%rowtype;
begin
  if v_uid is null or v_email = '' then return false; end if;
  select * into v_allow from public.allowed_emails where lower(email) = v_email;
  if not found then return false; end if;

  insert into public.league_members (league_id, user_id, is_player)
  values (v_allow.league_id, v_uid, coalesce(v_allow.is_player, true))
  on conflict do nothing;
  update public.allowed_emails set user_id = v_uid where email = v_allow.email and user_id is null;
  if v_allow.is_commissioner then
    update public.profiles set role = 'commissioner' where id = v_uid and role <> 'commissioner';
  end if;
  return true;
end;
$$;
revoke execute on function public.fn_claim_membership() from public, anon;
grant execute on function public.fn_claim_membership() to authenticated;
