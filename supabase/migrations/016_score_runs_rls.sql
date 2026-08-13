-- score_runs (014) was added after 015_enable_rls.sql's table list was written, so it
-- never got RLS. Same policy shape: restrict to the single app user.
ALTER TABLE score_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY score_runs_select_user_1 ON score_runs FOR SELECT USING (user_id = 'user_1');
CREATE POLICY score_runs_insert_user_1 ON score_runs FOR INSERT WITH CHECK (user_id = 'user_1');
CREATE POLICY score_runs_update_user_1 ON score_runs FOR UPDATE USING (user_id = 'user_1') WITH CHECK (user_id = 'user_1');
CREATE POLICY score_runs_delete_user_1 ON score_runs FOR DELETE USING (user_id = 'user_1');
