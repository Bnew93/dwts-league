-- 0010_profile_last_reveal.sql — which elimination reveal a user has already seen.
-- Key format: '<season>:<week>'. Compared against the latest elimination week on load.
alter table public.profiles add column last_reveal_key text;
