// The tables use TIMESTAMP (without time zone) and every value in them is UTC —
// written by Postgres NOW() on Supabase's UTC server or by the app's
// toISOString(). Supabase returns them without an offset
// ("2026-10-03T15:11:47.511"), which `new Date()` reads as the browser's LOCAL
// time: two hours too old in German summer time ("Last scraped 3 h ago" for a
// scrape an hour ago). Always parse database timestamps through this.
export function parseDbTimestamp(value: string): Date {
  const hasTime = value.includes("T") || value.includes(" ");
  const hasOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value);
  return new Date(hasTime && !hasOffset ? `${value.replace(" ", "T")}Z` : value);
}
