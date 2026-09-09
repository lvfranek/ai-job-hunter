-- employment_fit: fourth sub-score, mirrors the new employment_types /
-- work_time_models preferences (is this a Werkstudent role when I want one?).
--
-- blocker: the reason a job scored below the "worth applying" band, in plain
-- words ("Standort Zürich, kein Remote"). The scorer is now instructed to only
-- push a score under 35 when it can name a hard blocker here — that keeps
-- near-misses ("3 Jahre Erfahrung gefordert") out of the basement, where a
-- junior would never see them.
ALTER TABLE job_matches ADD COLUMN employment_fit INT
  CHECK (employment_fit >= 0 AND employment_fit <= 100);
ALTER TABLE job_matches ADD COLUMN blocker TEXT;
