import { CHANCES, chanceLabels, chanceRank, chanceShortLabels, type Chance } from "@/lib/chance";

// Dark tints with light text; the tiers differ in hue (green, blue, amber, red)
// and in the number of filled bars, so they never rely on colour alone.
export const chanceStyles: Record<
  Chance,
  { text: string; bg: string; border: string; bar: string; empty: string }
> = {
  low: {
    text: "text-rose-700",
    bg: "bg-rose-100",
    border: "border-rose-200",
    bar: "bg-rose-400",
    empty: "bg-rose-300",
  },
  fair: {
    text: "text-amber-700",
    bg: "bg-amber-100",
    border: "border-amber-200",
    bar: "bg-amber-400",
    empty: "bg-amber-300",
  },
  good: {
    text: "text-sky-700",
    bg: "bg-sky-100",
    border: "border-sky-200",
    bar: "bg-sky-400",
    empty: "bg-sky-300",
  },
  very_good: {
    text: "text-emerald-700",
    bg: "bg-emerald-100",
    border: "border-emerald-200",
    bar: "bg-emerald-600",
    empty: "bg-emerald-300",
  },
};

/**
 * Signal-strength bars: one to four filled, so the tier reads without relying
 * on colour alone.
 */
export function ChanceMeter({ chance }: { chance: Chance }) {
  const rank = chanceRank(chance);
  const style = chanceStyles[chance];
  return (
    <span className="flex h-3 shrink-0 items-end gap-0.5" aria-hidden="true">
      {CHANCES.map((tier, i) => (
        <span
          key={tier}
          className={`w-0.75 rounded-full ${i <= rank ? style.bar : style.empty}`}
          style={{ height: `${5 + i * 2}px` }}
        />
      ))}
    </span>
  );
}

/** The job card's tier badge; a fixed width keeps the titles in a list aligned. */
export function ChanceBadge({ chance }: { chance: Chance | null }) {
  if (chance === null) {
    return (
      <div
        className="inline-flex h-6 shrink-0 items-center justify-center rounded-md border px-2 border-border bg-surface-2"
        aria-label="Not scored yet"
      >
        <span className="text-[12px] font-medium text-text-faint">Not scored</span>
      </div>
    );
  }
  const style = chanceStyles[chance];
  return (
    <div
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 ${style.bg} ${style.border}`}
      aria-label={chanceLabels[chance]}
      title={chanceLabels[chance]}
    >
      <ChanceMeter chance={chance} />
      <span className={`whitespace-nowrap text-[12px] font-semibold leading-none ${style.text}`}>
        {chanceShortLabels[chance]}
      </span>
    </div>
  );
}

/** A smaller inline pill with the full label, for explanations and legends. */
export function ChancePill({ chance }: { chance: Chance }) {
  const style = chanceStyles[chance];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.bg} ${style.border} ${style.text}`}
    >
      <ChanceMeter chance={chance} />
      {chanceLabels[chance]}
    </span>
  );
}
