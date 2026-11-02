-- "Remove old posts" now deletes jobs outright instead of setting deleted_at.
-- Clear out the jobs it had only hidden (their scores and keyword rows go with
-- them via ON DELETE CASCADE), then drop the column. Run once the code that no
-- longer reads deleted_at is live.
DELETE FROM jobs WHERE deleted_at IS NOT NULL;
ALTER TABLE jobs DROP COLUMN IF EXISTS deleted_at;
