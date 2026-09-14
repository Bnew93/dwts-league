-- 0015_slug_available.sql — the creation wizard checks link-name availability on blur.
-- leagues_select is membership-scoped, so a plain select can't see other people's slugs.
create or replace function public.fn_slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_slug ~ '^[a-z0-9-]{2,32}$' and not exists (select 1 from public.leagues where slug = p_slug);
$$;
revoke execute on function public.fn_slug_available(text) from public, anon;
grant execute on function public.fn_slug_available(text) to authenticated;
