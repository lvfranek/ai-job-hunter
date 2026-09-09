-- Contract forms are an exclusion list, not a wish list. German job boards are
-- flooded with Werkstudent / Ausbildung / Freelance postings; what the candidate
-- needs to express is "filter these out", not "these are the only ones I want".
-- 022 introduced the column with the opposite meaning — rename it so the
-- semantics are unmistakable at every call site.
ALTER TABLE preferences RENAME COLUMN employment_types TO excluded_employment_types;
