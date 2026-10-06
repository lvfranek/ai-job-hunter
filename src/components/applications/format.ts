const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** YYYY-MM-DD → "3 Sept 2026"; a dash when there is no date. */
export function formatAppliedDate(value: string | null): string {
  return value ? dateFormat.format(new Date(`${value}T00:00:00Z`)) : "—";
}
