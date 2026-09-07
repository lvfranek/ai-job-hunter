/**
 * Run `fn` over `items` with at most `limit` in flight at once, in fixed rounds.
 * Never rejects — each result is wrapped as fulfilled/rejected (like
 * Promise.allSettled) so one failing item can't abort the rest. Results come
 * back in input order.
 *
 * Used by the scrape pipeline, which fans out to one Apify run per board ×
 * keyword (up to 25); firing all of them at once would hammer Apify and stack
 * 25 concurrent 5-minute polls.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const size = Math.max(1, limit);

  for (let i = 0; i < items.length; i += size) {
    const round = items.slice(i, i + size);
    await Promise.all(
      round.map(async (item, offset) => {
        const index = i + offset;
        try {
          results[index] = { status: "fulfilled", value: await fn(item, index) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      })
    );
  }

  return results;
}
