export type Platform = "linkedin" | "indeed" | "xing" | "stepstone" | "arbeitsagentur";

export type Job = {
  id: string;
  title: string;
  company: string;
  matchScore: number;
  postedDate: string;
  daysAgo: number;
  platform: Platform;
  url: string;
  description: string | null;
  isStale?: boolean;
  isScored: boolean;
};

export type AgentState = "idle" | "scraping" | "scoring";

export type AgentStatusData = {
  state: AgentState;
  action: string;
  detail: string;
};

export const platformLabels: Record<Platform, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  xing: "Xing",
  stepstone: "Stepstone",
  arbeitsagentur: "Arbeitsagentur",
};

// Arbeitsagentur and Stepstone have no logo on simpleicons.org (stepstone 404s) —
// JobCard renders a Phosphor icon for both instead of this image-based lookup.
export const platformIconSlugs: Record<Exclude<Platform, "arbeitsagentur" | "stepstone">, string> = {
  linkedin: "linkedin",
  indeed: "indeed",
  xing: "xing",
};
