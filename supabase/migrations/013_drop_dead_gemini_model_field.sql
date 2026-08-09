-- Dead field: never read anywhere in the app. The actual model comes exclusively
-- from OPENROUTER_MODEL in the environment (see src/lib/gemini.ts). Kept as a
-- settings column it would just mislead someone into thinking it does something.
ALTER TABLE settings DROP COLUMN preferred_gemini_model;
