-- Enable RLS on all tables; restrict to the single app user (user_id = 'user_1')
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'settings', 'preferences', 'jobs',
    'job_matches', 'scrape_runs', 'score_runs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_id = ''user_1'')',
      t || '_select_user_1', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (user_id = ''user_1'')',
      t || '_insert_user_1', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (user_id = ''user_1'') WITH CHECK (user_id = ''user_1'')',
      t || '_update_user_1', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (user_id = ''user_1'')',
      t || '_delete_user_1', t
    );
  END LOOP;
END $$;
