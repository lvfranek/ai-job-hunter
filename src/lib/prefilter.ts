/**
 * Check if a job URL already exists in the database.
 */
export async function isJobDuplicate(
  url: string,
  supabaseClient: ReturnType<typeof import("./supabase").getSupabaseServerClient>
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("jobs")
    .select("id")
    .eq("url", url)
    .limit(1);

  if (error) {
    console.error("Error checking duplicate:", error);
    return false;
  }

  return Boolean(data && data.length > 0);
}
