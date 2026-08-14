-- Generic key/value store for user-configurable API credentials (Apify, OpenRouter),
-- encrypted at rest by the app before insert. Lets self-hosters set these via the
-- Settings UI instead of only .env.local. Values fall back to process.env when no
-- row exists for a key (see src/lib/credentials.ts).
create table if not exists credentials (
  user_id text not null,
  key text not null,
  encrypted_value text not null, -- "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table credentials enable row level security;

create policy credentials_select_user_1 on credentials for select using (user_id = 'user_1');
create policy credentials_insert_user_1 on credentials for insert with check (user_id = 'user_1');
create policy credentials_update_user_1 on credentials for update using (user_id = 'user_1') with check (user_id = 'user_1');
create policy credentials_delete_user_1 on credentials for delete using (user_id = 'user_1');
