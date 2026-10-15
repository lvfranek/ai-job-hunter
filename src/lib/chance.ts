// The four chance tiers a scored job lands in, and the requirement checklist
// they are computed from. The tier is decided in code (scoring-rules.ts) — the
// model only reports which of the posting's must-haves the candidate covers.
//
// Pure module, no server imports: the dashboard, the stats page and the
// webhook all read the same tier order from here.

export type Chance = "low" | "fair" | "good" | "very_good";

/** Worst to best — an index into this is the tier's rank. */
export const CHANCES: Chance[] = ["low", "fair", "good", "very_good"];

export const chanceLabels: Record<Chance, string> = {
  low: "Low chance",
  fair: "Fair chance",
  good: "Good chance",
  very_good: "Very good chance",
};

/** For tight spots like the job card badge; the full label goes in the aria-label. */
export const chanceShortLabels: Record<Chance, string> = {
  low: "Low",
  fair: "Fair",
  good: "Good",
  very_good: "Very good",
};

export function isChance(value: unknown): value is Chance {
  return CHANCES.includes(value as Chance);
}

export function chanceRank(chance: Chance): number {
  return CHANCES.indexOf(chance);
}

/** The lower of two tiers — a cap can only ever pull a job down. */
export function lowerChance(a: Chance, b: Chance): Chance {
  return chanceRank(a) <= chanceRank(b) ? a : b;
}

/** `min` and every tier above it, e.g. "good" → good, very_good. */
export function chancesAtLeast(min: Chance): Chance[] {
  return CHANCES.slice(chanceRank(min));
}

/** Good or Very good — the bar for "High matches", stats and keyword suggestions. */
export function isGoodChance(chance: Chance | null | undefined): boolean {
  return chance != null && chanceRank(chance) >= chanceRank("good");
}

// ---- requirement checklist -----------------------------------------------------

export type RequirementStatus = "met" | "partial" | "missing";

/**
 * skill: anything learnable — tools, methods, domain knowledge, a degree that
 *   allows "or comparable experience".
 * qualification: a formal credential the posting makes mandatory with no
 *   alternative (licence, registration, a degree marked as required).
 * language: a spoken language the posting requires.
 */
export type RequirementKind = "skill" | "qualification" | "language";

export interface Requirement {
  text: string;
  kind: RequirementKind;
  status: RequirementStatus;
  /** The words from the candidate's profile that prove met/partial — checked in code. */
  evidence?: string | null;
  /** One of the few requirements the role is built around; these weigh most. */
  core?: boolean;
}

export const REQUIREMENT_STATUSES: RequirementStatus[] = ["met", "partial", "missing"];
export const REQUIREMENT_KINDS: RequirementKind[] = ["skill", "qualification", "language"];

/** Share of the must-haves covered, a partial counting half; null without any. */
export function coverageOf(requirements: Requirement[]): number | null {
  if (requirements.length === 0) return null;
  const covered = requirements.reduce(
    (sum, r) => sum + (r.status === "met" ? 1 : r.status === "partial" ? 0.5 : 0),
    0,
  );
  return covered / requirements.length;
}

/**
 * "Best chance" order: tier first, then how much of the checklist is covered,
 * then the newest posting. Unscored jobs go last.
 */
export function compareByChance(
  a: { chance: Chance | null; coverage: number | null; daysAgo: number },
  b: { chance: Chance | null; coverage: number | null; daysAgo: number },
): number {
  const rank = (c: Chance | null) => (c === null ? -1 : chanceRank(c));
  return (
    rank(b.chance) - rank(a.chance) ||
    (b.coverage ?? -1) - (a.coverage ?? -1) ||
    a.daysAgo - b.daysAgo
  );
}
