-- 0014_platform_admin.sql — the platform admin is keyed to Bill's auth.users.id (PHASE_1_5 §1).
-- No UI path sets this flag; it only ever changes through a migration like this one.
update public.profiles set is_platform_admin = true where id = 'b0abda1e-7ec2-40d6-94db-39963d021262';
