export type Platform = "linkedin" | "indeed" | "xing" | "stepstone" | "arbeitsagentur";

export type JobStatus =
  "interested" | "applied" | "interview" | "offer" | "rejected" | "not_interested";

export const JOB_STATUSES: JobStatus[] = [
  "interested",
  "applied",
  "interview",
  "offer",
  "rejected",
  "not_interested",
];

export const jobStatusLabels: Record<JobStatus, string> = {
  interested: "Interested",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  not_interested: "Not interested",
};

/** Statuses that mean "I sent an application" — these jobs show up in the tracker. */
export const APPLIED_STATUSES: JobStatus[] = ["applied", "interview", "offer", "rejected"];

/** `jobs.platform` of an application added by hand (or CSV) instead of scraped. */
export const MANUAL_PLATFORM = "manual";

/** The AI scorer's per-job breakdown, shown when a job card is expanded. */
export type JobMatchDetail = {
  skillOverlap: number;
  seniorityFit: number;
  locationFit: number;
  employmentFit: number;
  reasoning: string | null;
  /** Named hard reason the job scored low, or null when nothing blocks it. */
  blocker: string | null;
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
  match?: JobMatchDetail;
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
export const platformIconSlugs: Record<
  Exclude<Platform, "arbeitsagentur" | "stepstone">,
  string
> = {
  linkedin: "linkedin",
  indeed: "indeed",
  xing: "xing",
};
