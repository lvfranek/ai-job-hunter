export type Platform = "linkedin" | "indeed" | "xing";

export type Job = {
  id: number;
  title: string;
  company: string;
  matchScore: number;
  postedDate: string;
  daysAgo: number;
  platform: Platform;
  url: string;
};

export type AgentState = "idle" | "scraping" | "filtering" | "scoring";

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
};

export const platformIconSlugs: Record<Platform, string> = {
  linkedin: "linkedin",
  indeed: "indeed",
  xing: "xing",
};

export const mockJobs: Job[] = [
  {
    id: 1,
    title: "Senior React Developer",
    company: "Blaupause Systems",
    matchScore: 92,
    postedDate: "2 days ago",
    daysAgo: 2,
    platform: "linkedin",
    url: "https://linkedin.com/jobs/view/12345",
  },
  {
    id: 2,
    title: "Backend Engineer, Python",
    company: "Kestrel Software",
    matchScore: 67,
    postedDate: "5 days ago",
    daysAgo: 5,
    platform: "indeed",
    url: "https://indeed.com/viewjob?jk=abc123",
  },
  {
    id: 3,
    title: "Full-Stack Developer, Next.js",
    company: "Nordlicht Analytics",
    matchScore: 88,
    postedDate: "1 day ago",
    daysAgo: 1,
    platform: "xing",
    url: "https://xing.com/jobs/view/98765",
  },
  {
    id: 4,
    title: "DevOps Engineer",
    company: "Vantage Cloud Berlin",
    matchScore: 41,
    postedDate: "1 week ago",
    daysAgo: 7,
    platform: "linkedin",
    url: "https://linkedin.com/jobs/view/55501",
  },
  {
    id: 5,
    title: "Machine Learning Engineer",
    company: "Greenfield Robotics",
    matchScore: 74,
    postedDate: "3 days ago",
    daysAgo: 3,
    platform: "indeed",
    url: "https://indeed.com/viewjob?jk=def456",
  },
  {
    id: 6,
    title: "Product Designer, UI/UX",
    company: "Pixelwerk Studio",
    matchScore: 58,
    postedDate: "4 days ago",
    daysAgo: 4,
    platform: "xing",
    url: "https://xing.com/jobs/view/44210",
  },
  {
    id: 7,
    title: "Frontend Developer, Vue",
    company: "Deutsche FinTech AG",
    matchScore: 23,
    postedDate: "6 days ago",
    daysAgo: 6,
    platform: "linkedin",
    url: "https://linkedin.com/jobs/view/77832",
  },
];

export const mockAgentStatus: AgentStatusData = {
  state: "scoring",
  agent: "Agent 3",
  action: "Scoring jobs",
  detail: "12/18 complete",
};

export const mockLastScraped = "2 hours ago";
