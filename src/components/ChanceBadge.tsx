import { CHANCES, chanceLabels, chanceRank, chanceShortLabels, type Chance } from "@/lib/chance";

// Traffic-light tints at the same -100/-300/-800 steps as the rest of the app;
// Very good is the one solid badge so the best jobs stand out in a long list.
export const chanceStyles: Record<
  Chance,
  { text: string; bg: string; border: string; bar: string; empty: string }
> = {
  low: {
    text: "text-rose-800",
    bg: "bg-rose-100",
    border: "border-rose-300",
    bar: "bg-rose-600",
    empty: "bg-rose-300",
  },
  fair: {
    text: "text-amber-800",
    bg: "bg-amber-100",
    border: "border-amber-300",
    bar: "bg-amber-600",
    empty: "bg-amber-300",
  },
  good: {
    text: "text-green-800",
    bg: "bg-green-100",
    border: "border-green-300",
    bar: "bg-green-600",
    empty: "bg-green-300",
  },
  very_good: {
    text: "text-white",
    bg: "bg-emerald-600",
    border: "border-emerald-700",
    bar: "bg-white",
    empty: "bg-white/40",
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
        className="flex h-8 w-28 shrink-0 items-center justify-center rounded-xl border border-[#C9D8E3] bg-[#EEF4F9]"
        aria-label="Not scored yet"
      >
        <span className="text-[12px] font-medium text-text-faint">Not scored</span>
      </div>
    );
  }
  const style = chanceStyles[chance];
  return (
    <div
      className={`flex h-8 w-28 shrink-0 items-center gap-2 rounded-xl border px-2.5 ${style.bg} ${style.border}`}
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
