export type Platform = "linkedin" | "indeed" | "xing" | "stepstone";

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

export type AgentState = "idle" | "scraping";

export type AgentStatusData = {
  state: AgentState;
  agent: string;
  action: string;
  detail: string;
};

export const platformLabels: Record<Platform, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  xing: "Xing",
  stepstone: "Stepstone",
};

export const platformIconSlugs: Record<Platform, string> = {
  linkedin: "linkedin",
  indeed: "indeed",
  xing: "xing",
  stepstone: "stepstone",
};
