-- The AI model is now fixed in code (AI_MODEL in src/lib/openrouter.ts) and no
-- longer read from the credentials table. Drop the leftover override row so it
-- can't mislead anyone into thinking it still selects the model.
delete from credentials where key = 'openrouter_model';
