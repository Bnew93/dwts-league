-- 0007_couple_images.sql — photo URLs for couple cards (Wikipedia page thumbnails).
alter table public.couples
  add column celebrity_image_url text,
  add column pro_image_url text;
