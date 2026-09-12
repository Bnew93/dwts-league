-- 0008_couple_image_url.sql — one official couple photo per couple replaces the
-- separate celebrity/pro headshots (Season 35 promo set: both dancers in frame).
alter table public.couples add column image_url text;
alter table public.couples drop column celebrity_image_url, drop column pro_image_url;
