export type Platform = "linkedin" | "indeed" | "xing" | "stepstone" | "arbeitsagentur";

export type JobStatus = "interested" | "applied" | "interview" | "not_interested";

export const JOB_STATUSES: JobStatus[] = ["interested", "applied", "interview", "not_interested"];

export const jobStatusLabels: Record<JobStatus, string> = {
  interested: "Interested",
  applied: "Applied",
  interview: "Interview",
  not_interested: "Not interested",
};

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
  status: JobStatus | null;
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
