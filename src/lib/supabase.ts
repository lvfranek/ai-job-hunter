import { createClient } from "@supabase/supabase-js";

// All database access goes through this server-only client (service role key,
// bypasses RLS). The anon key is deliberately unused: RLS denies anon access,
// so the app's password gate (src/proxy.ts) is the only way in.
export const getSupabaseServerClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
};

// Single-user ID for v1
export const CURRENT_USER_ID = "user_1";
