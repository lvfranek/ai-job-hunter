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

/**
 * Read every row a query matches. PostgREST caps each response at 1000 rows
 * (Supabase's default max-rows), so a plain select silently truncates past that.
 * `page` must build a fresh query with a stable `.order()` and apply the range.
 * `T` is the row shape — the client has no generated DB types to infer it from.
 */
export async function selectAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}
