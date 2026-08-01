-- 'ready' sits between draft and released: content-frozen and reviewable, but not yet on
-- the website. Placed BEFORE 'released' so the enum's own ordering matches the workflow,
-- which keeps ORDER BY status meaningful.
ALTER TYPE "menu_week_status" ADD VALUE IF NOT EXISTS 'ready' BEFORE 'released';
