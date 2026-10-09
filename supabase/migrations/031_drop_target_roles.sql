-- Job titles don't decide a chance — the tasks and requirements in a posting
-- do. The scorer now compares a posting's tasks with the CV and skills instead
-- of with a list of target roles, so the column has nothing left to feed.
ALTER TABLE preferences DROP COLUMN IF EXISTS target_roles;
