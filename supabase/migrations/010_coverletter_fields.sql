-- Cover letter generation reuses the existing profiles table (already scoped to
-- cover-letter-only data) instead of a new table — avoids re-duplicating
-- name/email/phone/location, which already live here.
ALTER TABLE profiles ADD COLUMN street_address TEXT;
ALTER TABLE profiles ADD COLUMN personal_story TEXT;
ALTER TABLE profiles ADD COLUMN key_achievements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE profiles ADD COLUMN motivation TEXT;
