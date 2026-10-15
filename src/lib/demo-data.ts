// Fixtures for guest/demo mode. Everything a demo visitor sees comes from here —
// no Supabase, no Apify, no OpenRouter, no webhook. See src/app/api/demo and
// src/proxy.ts for how these get served.
import { CHANCES, type Chance, type Requirement } from "@/lib/chance";
import { SCORING_VERSION } from "@/lib/scoring-rules";
import type { DbJob, JobMatch, JobWithMatch, Preferences, Profile, Settings } from "@/lib/types";
import type { ParsedProfile } from "@/lib/agents/agent-1";
import type { CoverLetterLanguage } from "@/lib/agents/agent-4";
import type { ApplicationRow } from "@/lib/applications";
import { APPLIED_STATUSES, MANUAL_PLATFORM, type JobStatus } from "@/lib/mock-data";
import {
  computeStats,
  suggestKeywords,
  type StatsJob,
  type StatsJobKeyword,
  type StatsResponse,
  type StatsSearch,
} from "@/lib/keyword-stats";

const DEMO_USER_ID = "demo";

/** ISO string for `days` ago — computed at call time so the demo always reads "N days ago". */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

interface JobSeed {
  slug: string;
  title: string;
  company: string;
  platform: string;
  url: string;
  description: string | null;
  status: string | null;
  postedDaysAgo: number;
  /** The job's chance. `unscored` hides it in the initial dashboard view. */
  chance: Chance;
  requirements: Requirement[];
  downgrades?: string[];
  /** What the board says about where the job is. */
  location?: string;
  /** Measured from the demo candidate's city (Berlin) when the distance rule applies. */
  distanceKm?: number;
  unscored?: boolean;
  stale?: boolean;
  blocker?: string;
  reasoning?: string;
}

const met = (text: string): Requirement => ({ text, kind: "skill", status: "met" });
const partial = (text: string): Requirement => ({ text, kind: "skill", status: "partial" });
const missing = (text: string): Requirement => ({ text, kind: "skill", status: "missing" });

// 16 fictional postings — real-sounding but invented companies (no impersonation).
// Spread across all 5 platforms, several statuses, all four chance tiers, plus
// 2 not-yet-scored and 1 stale so the "Adjust score" button has something to do.
// Tiers and checklists follow the real rules for the demo candidate below.
const JOB_SEEDS: JobSeed[] = [
  {
    slug: "nimbus-senior-frontend",
    title: "Senior Frontend Engineer (React / TypeScript)",
    company: "Nimbus Retail GmbH",
    platform: "linkedin",
    url: "https://example.com/demo/jobs/nimbus-senior-frontend",
    description:
      "We're rebuilding our storefront on Next.js and need a senior frontend engineer who cares about performance and accessibility. You'll own the checkout flow end to end, mentor two mid-level engineers, and work closely with design on a new component library.\n\nStack: React, TypeScript, Next.js App Router, Tailwind, Playwright. German not required, English is the working language.",
    status: "interested",
    postedDaysAgo: 2,
    location: "Berlin",
    distanceKm: 0,
    chance: "very_good",
    requirements: [
      met("React"),
      met("TypeScript"),
      met("Next.js App Router"),
      met("Web accessibility"),
      partial("Playwright"),
    ],
    reasoning:
      "Your React, TypeScript and Next.js work covers the core stack; Playwright end-to-end testing is the one thing you've done less of.",
  },
  {
    slug: "kesselhaus-fullstack",
    title: "Full-Stack Developer (Node.js / React)",
    company: "Kesselhaus Digital",
    platform: "indeed",
    url: "https://example.com/demo/jobs/kesselhaus-fullstack",
    description:
      "Small product team (8 engineers) building B2B logistics tooling. You'd split your time roughly 60/40 frontend/backend: React on the client, Node.js + PostgreSQL on the server. We ship to production several times a day.",
    status: "applied",
    postedDaysAgo: 5,
    location: "Berlin",
    distanceKm: 0,
    chance: "good",
    requirements: [
      met("React"),
      met("Node.js"),
      met("PostgreSQL"),
      missing("Logistics domain knowledge"),
    ],
  },
  {
    slug: "aurelia-vue",
    title: "Frontend Developer — Vue.js",
    company: "Aurelia Health AG",
    platform: "stepstone",
    url: "https://example.com/demo/jobs/aurelia-vue",
    description:
      "Healthtech scale-up. Our web app is Vue 3 + Pinia. Looking for someone comfortable owning features from Figma to production, with an eye for detail and a habit of writing tests.",
    status: null,
    postedDaysAgo: 3,
    location: "Potsdam",
    distanceKm: 5,
    chance: "good",
    requirements: [partial("Vue 3"), partial("Pinia"), met("Figma"), met("Frontend testing")],
    reasoning:
      "Your Figma-to-production and testing habits fit well; Vue 3 and Pinia are only in your basics, not your day-to-day stack.",
  },
  {
    slug: "lindwurm-react-native",
    title: "React Native Engineer",
    company: "Lindwurm Mobility",
    platform: "xing",
    url: "https://example.com/demo/jobs/lindwurm-react-native",
    description:
      "Mobility startup. You'd join the mobile team building our rider app in React Native (Expo). Experience with native modules and app-store release processes is a plus.",
    status: "interview",
    postedDaysAgo: 8,
    location: "Berlin",
    distanceKm: 0,
    chance: "good",
    requirements: [
      met("React"),
      met("TypeScript"),
      partial("React Native (Expo)"),
      partial("App-store releases"),
    ],
  },
  {
    slug: "fjordline-django",
    title: "Backend Engineer (Python / Django)",
    company: "Fjordline Logistics",
    platform: "indeed",
    url: "https://example.com/demo/jobs/fjordline-django",
    description:
      "Backend-heavy role on our fleet-management platform. Django, Django REST Framework, Celery, PostgreSQL. Some React on the internal admin, but this is 90% backend.",
    status: "not_interested",
    postedDaysAgo: 12,
    location: "Berlin",
    chance: "low",
    requirements: [missing("Django"), missing("Celery"), met("PostgreSQL"), met("React")],
    blocker: "Python as core language – not in your skills; Dealbreaker: Django-heavy backend role",
    reasoning:
      "PostgreSQL and the React admin fit, but this is a 90% Django backend role — exactly what you ruled out.",
  },
  {
    slug: "steinkraft-devops",
    title: "DevOps Engineer (AWS / Kubernetes)",
    company: "Steinkraft Cloud",
    platform: "linkedin",
    url: "https://example.com/demo/jobs/steinkraft-devops",
    description:
      "Platform team. You'd own our EKS clusters, Terraform modules, and CI/CD pipelines (GitHub Actions). On-call rotation is one week in six.",
    status: null,
    postedDaysAgo: 1,
    location: "Remote",
    chance: "fair",
    requirements: [
      partial("AWS"),
      missing("Terraform"),
      missing("Kubernetes (EKS)"),
      met("GitHub Actions"),
      met("Docker"),
    ],
    downgrades: ["Tasks differ from what you've done – at most Fair"],
    reasoning:
      "Your Docker and GitHub Actions experience transfers, but Terraform and Kubernetes are missing and this is a platform role, not frontend.",
  },
  {
    slug: "morgenroth-junior-frontend",
    title: "Junior Frontend Developer",
    company: "Morgenroth Media",
    platform: "arbeitsagentur",
    url: "https://example.com/demo/jobs/morgenroth-junior-frontend",
    description:
      "Digital agency working on campaign microsites and a few longer-lived products. React and a bit of WordPress. Good place to learn, mentorship from two seniors.",
    status: null,
    postedDaysAgo: 6,
    location: "Berlin",
    distanceKm: 0,
    chance: "good",
    requirements: [met("React"), met("HTML & CSS"), partial("WordPress")],
    downgrades: ["Junior role, below the level you target – at most Good"],
  },
  {
    slug: "halcyon-frontend-platform",
    title: "Software Engineer — Frontend Platform",
    company: "Halcyon Labs",
    platform: "linkedin",
    url: "https://example.com/demo/jobs/halcyon-frontend-platform",
    description:
      "You'd work on the shared frontend platform used by four product teams: the design system, build tooling, and the internal component library. Lots of TypeScript, Storybook, and cross-team collaboration.",
    status: null,
    postedDaysAgo: 4,
    location: "Berlin",
    distanceKm: 0,
    chance: "very_good",
    requirements: [
      met("TypeScript"),
      met("Design systems"),
      met("Storybook"),
      met("Component libraries"),
      partial("Build tooling"),
    ],
    reasoning:
      "Almost exactly what you did before — you built a shared component library used by four teams; build tooling is the only lighter spot.",
  },
  {
    slug: "weberei-typescript-fullstack",
    title: "TypeScript Engineer (Full-Stack)",
    company: "Weberei Software GmbH",
    platform: "stepstone",
    url: "https://example.com/demo/jobs/weberei-typescript-fullstack",
    description:
      "End-to-end TypeScript: React frontend, Node.js (Fastify) backend, Prisma + PostgreSQL. Product is a scheduling tool for clinics. Hybrid, 2 days/week in the Leipzig office.",
    status: "interested",
    postedDaysAgo: 10,
    location: "Leipzig",
    distanceKm: 127,
    chance: "low",
    blocker: "Office in Leipzig, 127 km away – you want within 25 km of Berlin",
    requirements: [
      met("React"),
      met("Node.js"),
      partial("Fastify"),
      partial("Prisma"),
      met("PostgreSQL"),
    ],
    reasoning:
      "End-to-end TypeScript is exactly your stack, but it's hybrid with two office days a week in Leipzig — far outside your 25 km around Berlin.",
  },
  {
    slug: "kontor12-laravel",
    title: "PHP Developer (Laravel)",
    company: "Kontor 12 Agency",
    platform: "indeed",
    url: "https://example.com/demo/jobs/kontor12-laravel",
    description:
      "Agency work: client projects on Laravel + Livewire, occasional Vue. Fast pace, lots of variety in the client base.",
    status: "not_interested",
    postedDaysAgo: 15,
    location: "Berlin",
    chance: "low",
    requirements: [missing("Laravel"), missing("Livewire"), partial("Vue")],
    blocker: "PHP as core language – not in your skills; Dealbreaker: Agency client work",
    reasoning:
      "Only the occasional Vue overlaps; this is a PHP/Laravel agency role, which you ruled out on both stack and agency churn.",
  },
  {
    slug: "adlerauge-angular",
    title: "Frontend Engineer (Angular)",
    company: "Adlerauge Analytics",
    platform: "xing",
    url: "https://example.com/demo/jobs/adlerauge-angular",
    description:
      "Analytics dashboards built in Angular 17. Heavy on data visualisation (D3, ngx-charts). RxJS experience important.",
    status: null,
    postedDaysAgo: 7,
    location: "Berlin",
    distanceKm: 0,
    chance: "fair",
    requirements: [
      missing("Angular 17"),
      partial("RxJS"),
      partial("D3"),
      met("TypeScript"),
      met("Data visualisation"),
    ],
    reasoning:
      "TypeScript and dashboard work fit, but the role is built on Angular and RxJS, which you haven't used professionally.",
  },
  {
    slug: "polarstern-senior-react",
    title: "Senior React Developer (Remote, EU)",
    company: "Polarstern Systems",
    platform: "linkedin",
    url: "https://example.com/demo/jobs/polarstern-senior-react",
    description:
      "Fully remote within the EU. Product is a data-heavy B2B SaaS. React, TypeScript, React Query, a Go backend you won't usually touch. Strong async-communication culture.",
    status: null,
    postedDaysAgo: 0,
    location: "Remote",
    chance: "very_good",
    requirements: [met("React"), met("TypeScript"), met("React Query"), met("B2B SaaS experience")],
    stale: true,
    reasoning:
      "Remote within the EU, senior React and TypeScript on a product SaaS — every must-have is in your profile.",
  },
  {
    slug: "blaupause-werkstudent",
    title: "Web Developer (Werkstudent)",
    company: "Blaupause Studio",
    platform: "arbeitsagentur",
    url: "https://example.com/demo/jobs/blaupause-werkstudent",
    description: null,
    status: null,
    postedDaysAgo: 18,
    location: "Berlin",
    chance: "low",
    requirements: [],
    blocker: "Working student position – you excluded this contract form",
    downgrades: ["Little or no job description – at most Fair"],
    reasoning:
      "A working-student position — a contract form you excluded, and the posting has no description to judge it by.",
  },
  {
    slug: "zeitgeist-cloud-platform",
    title: "Cloud Platform Engineer",
    company: "Zeitgeist Cloud",
    platform: "stepstone",
    url: "https://example.com/demo/jobs/zeitgeist-cloud-platform",
    description: null,
    status: null,
    postedDaysAgo: 9,
    location: "Berlin",
    distanceKm: 0,
    chance: "fair",
    requirements: [],
    downgrades: ["Little or no job description – at most Fair"],
    unscored: true,
    reasoning:
      "The title points at infrastructure work and the posting has no description, so there's little to match against.",
  },
  {
    slug: "habicht-react-next",
    title: "Frontend Developer (React / Next.js)",
    company: "Habicht Commerce",
    platform: "indeed",
    url: "https://example.com/demo/jobs/habicht-react-next",
    description:
      "E-commerce platform team. Next.js (App Router), TypeScript, Tailwind, a headless CMS. You'd focus on the customer-facing storefront and its Core Web Vitals.",
    status: null,
    postedDaysAgo: 1,
    location: "Berlin",
    distanceKm: 0,
    chance: "very_good",
    requirements: [
      met("Next.js App Router"),
      met("TypeScript"),
      met("Tailwind CSS"),
      met("Core Web Vitals"),
    ],
    unscored: true,
    reasoning:
      "Next.js, TypeScript and Tailwind storefront work with a performance focus — your LCP work is exactly that.",
  },
  {
    slug: "sonnenschein-eng-manager",
    title: "Engineering Manager — Frontend",
    company: "Sonnenschein Group",
    platform: "linkedin",
    url: "https://example.com/demo/jobs/sonnenschein-eng-manager",
    description:
      "People-management role leading two frontend squads (9 engineers total). Still hands-on ~20% of the time. Requires prior lead or management experience.",
    status: null,
    postedDaysAgo: 20,
    location: "Berlin",
    distanceKm: 0,
    chance: "fair",
    requirements: [
      met("React"),
      met("Frontend architecture"),
      missing("People management"),
      partial("Hiring"),
    ],
    downgrades: ["Tasks only partly match your experience – at most Good"],
    reasoning:
      "Your frontend architecture background fits, but this is a people-management role and you haven't managed a team yet.",
  },
];

function buildMatch(seed: JobSeed): JobMatch {
  return {
    id: `demo-match-${seed.slug}`,
    job_id: `demo-job-${seed.slug}`,
    user_id: DEMO_USER_ID,
    chance: seed.chance,
    requirements: seed.requirements,
    downgrades: seed.downgrades ?? [],
    distance_km: seed.distanceKm ?? null,
    work_arrangement: seed.location === "Remote" ? "remote" : "hybrid",
    work_location: seed.distanceKm !== undefined ? (seed.location ?? null) : null,
    blocker: seed.blocker ?? null,
    reasoning:
      seed.reasoning ??
      "Demo data — the AI scorer does not run in guest mode, so this reasoning is illustrative.",
    stale_at: null,
    scoring_version: SCORING_VERSION,
    notified_at: null,
    created_at: daysAgoIso(Math.max(0, seed.postedDaysAgo - 1)),
  };
}

function buildJob(seed: JobSeed, forceScored: boolean): JobWithMatch {
  const base: DbJob = {
    id: `demo-job-${seed.slug}`,
    user_id: DEMO_USER_ID,
    url: seed.url,
    title: seed.title,
    company: seed.company,
    description: seed.description,
    platform: seed.platform,
    status: seed.status,
    applied_at:
      seed.status === "applied" || seed.status === "interview"
        ? daysAgoIso(Math.max(0, seed.postedDaysAgo - 1)).slice(0, 10)
        : null,
    salary: null,
    posted_date: daysAgoIso(seed.postedDaysAgo),
    location: seed.location ?? null,
    postal_code: null,
    country_code: null,
    latitude: null,
    longitude: null,
    created_at: daysAgoIso(seed.postedDaysAgo),
    deleted_at: null,
  };

  if (!forceScored && seed.unscored) {
    return { ...base, job_matches: null };
  }

  const match = buildMatch(seed);
  if (!forceScored && seed.stale) {
    match.stale_at = daysAgoIso(0);
  }
  return { ...base, job_matches: match };
}

/** Initial dashboard view: 2 jobs unscored, 1 stale. */
export const demoJobs: JobWithMatch[] = JOB_SEEDS.map((s) => buildJob(s, false));

/** After a simulated "Adjust score": every job scored, nothing stale. */
export const demoJobsScored: JobWithMatch[] = JOB_SEEDS.map((s) => buildJob(s, true));

export function findDemoJob(id: string | undefined | null): JobWithMatch | undefined {
  if (!id) return undefined;
  return demoJobsScored.find((j) => j.id === id) ?? demoJobs.find((j) => j.id === id);
}

/** Response shape of GET /api/applications: applied demo jobs plus a few added by hand. */
export const demoApplications: ApplicationRow[] = [
  ...demoJobs
    .filter((j) => (APPLIED_STATUSES as (string | null)[]).includes(j.status))
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      url: j.url,
      platform: j.platform,
      status: j.status as JobStatus,
      applied_at: j.applied_at,
      salary: null,
      created_at: j.created_at,
    })),
  ...(
    [
      ["Frontend Developer (m/w/d)", "Lindwurm Software GmbH", "interview", 6, "52–58k"],
      ["React Engineer", "Kranich Mobility AG", "applied", 9, null],
      ["Junior Web Developer", "Seeblick Media", "rejected", 21, "45k"],
      ["Full-Stack Developer", "Polarlicht Health GmbH", "applied", 13, null],
    ] as const
  ).map(([title, company, status, days, salary], i) => ({
    id: `demo-application-${i}`,
    title,
    company,
    url: null,
    platform: MANUAL_PLATFORM,
    status,
    applied_at: daysAgoIso(days).slice(0, 10),
    salary,
    created_at: daysAgoIso(days),
  })),
].sort((a, b) => (b.applied_at ?? "").localeCompare(a.applied_at ?? ""));

export const demoPreferences: Preferences = {
  id: "demo-preferences",
  user_id: DEMO_USER_ID,
  notes:
    "Product companies with a real design culture that ship to users weekly. Open to Vue or " +
    "Svelte teams. I'd like to grow towards a senior IC role, not management.",
  dealbreakers:
    "Django- or PHP-heavy backend roles, agency/consultancy client work, gambling or gaming.",
  experience_years: 4,
  target_levels: ["mid", "senior"],
  max_required_years: null,
  background:
    "2022–today  Frontend Developer, Lumen Software GmbH (Berlin) — cut the main app's LCP from " +
    "4.1s to 1.3s; led the migration of a 120k-line codebase from Create React App to the Next.js " +
    "App Router; built the shared component library used by four product teams.\n" +
    "2020–2022  Junior Web Developer, Seeblick Media — React and Node.js for client dashboards.\n" +
    "2016–2020  B.Sc. Media Informatics, HTW Berlin.",
  focus_skills: "TypeScript, React",
  own_skills:
    "React, TypeScript, JavaScript, Next.js, Node.js, Tailwind CSS, Git, PostgreSQL, Figma, " +
    "Storybook, design systems, web accessibility, frontend testing",
  basic_skills: "Vue, Docker, AWS, GitHub Actions, React Native",
  education: "B.Sc. Media Informatics (HTW Berlin)",
  certifications: "",
  spoken_languages: "German native, English C1",
  job_type: ["remote", "hybrid"],
  work_locations: [{ place: "Berlin", radius_km: 25 }],
  excluded_employment_types: ["ausbildung", "werkstudent"],
  work_time_models: ["vollzeit", "teilzeit"],
  created_at: daysAgoIso(45),
  updated_at: daysAgoIso(4),
};

export const demoSettings: Settings = {
  id: "demo-settings",
  user_id: DEMO_USER_ID,
  scraper_search_keywords: [
    "frontend developer",
    "react developer",
    "typescript engineer",
    "full-stack developer",
  ],
  scraper_location: "Berlin, Germany",
  scraper_max_posting_age_days: 21,
  scraper_results_per_scan: 25,
  remote_only: false,
  portal_toggles: {
    indeed: true,
    linkedin: true,
    xing: true,
    stepstone: true,
    arbeitsagentur: false,
  },
  notification_min_chance: "very_good",
  created_at: daysAgoIso(45),
  updated_at: daysAgoIso(6),
};

export const demoProfile: Profile = {
  id: "demo-profile",
  user_id: DEMO_USER_ID,
  name: "Alex Demo",
  email: "alex.demo@example.com",
  phone: "+49 30 1234567",
  location: "10405 Berlin",
  street_address: "Beispielstraße 12",
  personal_story:
    "I got into web development rebuilding my football club's ancient website in a weekend — it had to work on the treasurer's ten-year-old phone, and that constraint taught me more about performance and accessibility than any course since.",
  key_achievements: [
    "Cut the main app's Largest Contentful Paint from 4.1s to 1.3s by reworking the data-fetching layer and code-splitting the dashboard.",
    "Led the migration of a 120k-line codebase from Create React App to the Next.js App Router with zero downtime.",
    "Built the company's first shared component library, now used by four product teams.",
  ],
  motivation:
    "I want to work somewhere that treats the frontend as a craft, ships to real users weekly, and cares about the details between the mockup and production.",
  created_at: daysAgoIso(60),
  updated_at: daysAgoIso(8),
};

/** Response shape of POST /api/profile/parse. */
export const demoParsedCv: ParsedProfile = {
  name: demoProfile.name,
  email: demoProfile.email,
  phone: demoProfile.phone,
  street_address: demoProfile.street_address,
  location: demoProfile.location,
};

/** Response shape of GET /api/credentials — fake, non-secret "last 4" only. */
export const demoCredentials = {
  secrets: {
    apify_api_key: { configured: true, last4: "demo", source: "env" as const },
    openrouter_api_key: { configured: true, last4: "demo", source: "env" as const },
  },
  config: {
    apify_scraper_indeed: "demo/indeed-scraper",
    apify_scraper_linkedin: "demo/linkedin-scraper",
    apify_scraper_xing: "demo/xing-scraper",
    apify_scraper_stepstone: "demo/stepstone-scraper",
    apify_scraper_arbeitsagentur: "demo/arbeitsagentur-scraper",
  },
};

/** Response shape of GET /api/scrape/status. */
export const demoScrapeStatus = {
  runId: "demo",
  status: "completed" as const,
  jobsFound: 14,
  jobsFiltered: 9,
  jobsStored: 4,
  portalCounts: { indeed: 5, linkedin: 4, xing: 2, stepstone: 3 },
  totalRuns: 16,
  completedRuns: 16,
  stalled: false,
  completedAt: new Date().toISOString(),
};

/** Response shape of GET /api/score/status. */
export const demoScoreStatus = {
  runId: "demo",
  status: "completed" as const,
  total: 3,
  scored: 3,
  failed: 0,
  totalChunks: 1,
  completedChunks: 1,
  model: "demo/guest-mode",
  errorSummary: {},
  stalled: false,
  completedAt: new Date().toISOString(),
};

/** Canned cover-letter body paragraphs — used instead of the LLM in demo. */
export const demoCoverLetterParagraphs: Record<CoverLetterLanguage, string[]> = {
  de: [
    "Als ich vor einigen Jahren die veraltete Website meines Sportvereins an einem Wochenende neu gebaut habe, musste sie auf dem zehn Jahre alten Telefon des Kassenwarts funktionieren. Diese Einschränkung hat mir mehr über Performance und Barrierefreiheit beigebracht als jedes Tutorial danach – und sie prägt bis heute, wie ich Frontend-Arbeit angehe.",
    "In meiner aktuellen Rolle habe ich den Largest Contentful Paint unserer Hauptanwendung von 4,1 auf 1,3 Sekunden gesenkt, indem ich die Datenlade-Schicht überarbeitet und das Dashboard code-gesplittet habe. Parallel dazu habe ich die Migration einer 120.000 Zeilen großen Codebasis von Create React App auf den Next.js App Router ohne Ausfallzeit geleitet.",
    "Was mich an dieser Position reizt, ist die Verbindung aus einem klaren Produktfokus und einer echten Design-Kultur. Ich arbeite am liebsten an der Schnittstelle zwischen Entwurf und Produktion – dort, wo aus einem Figma-Screen eine schnelle, zugängliche und wartbare Oberfläche wird.",
    "Über die Gelegenheit, mich persönlich vorzustellen und zu besprechen, wie ich Ihr Team unterstützen kann, würde ich mich sehr freuen. Für Rückfragen stehe ich jederzeit zur Verfügung.",
  ],
  en: [
    "A few years ago I spent a weekend rebuilding my sports club's ageing website, and it had to run on the treasurer's ten-year-old phone. That single constraint taught me more about performance and accessibility than any tutorial since, and it still shapes how I approach frontend work today.",
    "In my current role I brought our main application's Largest Contentful Paint down from 4.1 to 1.3 seconds by reworking the data-fetching layer and code-splitting the dashboard. Alongside that, I led the migration of a 120,000-line codebase from Create React App to the Next.js App Router with zero downtime.",
    "What draws me to this role is the combination of a clear product focus and a genuine design culture. I do my best work at the seam between design and production, turning a Figma screen into an interface that is fast, accessible and maintainable.",
    "I would welcome the chance to introduce myself properly and talk through how I could support your team. I am happy to answer any questions in the meantime.",
  ],
};

// ---- Statistics page --------------------------------------------------------
// Synthetic scrape history, run through the real aggregation so the demo shows
// exactly what the page computes. A fixed-seed generator keeps it identical on
// every load.

interface KeywordProfile {
  keyword: string;
  /** Searched in the last `runs` scrape runs only. */
  runs: number;
  perSearch: number;
  goodRate: number;
  titles: string[];
  /** Another keyword that tends to find the same jobs, and how often it does. */
  overlapsWith?: string;
  overlapRate?: number;
}

const STATS_PROFILES: KeywordProfile[] = [
  {
    keyword: "react developer",
    runs: 8,
    perSearch: 7,
    goodRate: 0.32,
    titles: ["React Developer (m/w/d)", "Frontend Engineer React", "UI Engineer (m/w/d)"],
    overlapsWith: "frontend developer",
    overlapRate: 0.5,
  },
  {
    keyword: "frontend developer",
    runs: 8,
    perSearch: 9,
    goodRate: 0.22,
    titles: ["Frontend Developer (m/w/d)", "Frontend-Entwickler Vue", "UI Engineer (m/w/d)"],
  },
  {
    keyword: "typescript engineer",
    runs: 8,
    perSearch: 4,
    goodRate: 0.3,
    titles: ["TypeScript Engineer", "Product Engineer (m/w/d)", "Node.js Developer"],
  },
  {
    keyword: "full-stack developer",
    runs: 2,
    perSearch: 8,
    goodRate: 0.15,
    titles: ["Full-Stack Developer (m/w/d)", "Product Engineer (m/w/d)"],
  },
  {
    keyword: "javascript developer",
    runs: 5,
    perSearch: 8,
    goodRate: 0.06,
    titles: ["JavaScript Developer", "Senior JavaScript Engineer", "Web Developer PHP/JS"],
    // Nearly everything it finds, "frontend developer" finds too → redundant.
    overlapsWith: "frontend developer",
    overlapRate: 0.92,
  },
  {
    keyword: "web entwickler",
    runs: 4,
    perSearch: 6,
    goodRate: 0.03,
    titles: ["Webentwickler TYPO3 (m/w/d)", "Web-Entwickler WordPress", "Ausbildung Webentwickler"],
  },
];

const STATS_PORTALS = ["linkedin", "indeed", "stepstone", "xing"];
const STATS_RUNS = 10;
const LOW_CHANCE_BLOCKERS = [
  "On-site, no home office – you only want 100% remote or hybrid",
  "6 years of experience required – you have 4 years",
  "PHP as core language – not in your skills",
  "Apprenticeship – you excluded this contract form",
  "Missing language: Business French",
  "Dealbreaker: Agency client work",
  null,
];

function buildDemoStats(): StatsResponse {
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];

  const jobs: StatsJob[] = [];
  const links: StatsJobKeyword[] = [];
  const searches: StatsSearch[] = [];

  for (let run = 0; run < STATS_RUNS; run++) {
    const runId = `demo-run-${run}`;
    const runAt = daysAgoIso((STATS_RUNS - run) * 3);
    // Later runs re-find more of what earlier ones already brought in.
    const freshShare = Math.max(0.2, 0.85 - run * 0.07);
    for (const profile of STATS_PROFILES) {
      // Paused keywords ran early; recently added ones only ran lately.
      const searched =
        profile.keyword === "web entwickler" || profile.keyword === "javascript developer"
          ? run < profile.runs
          : run >= STATS_RUNS - profile.runs;
      if (!searched) continue;
      for (const portal of STATS_PORTALS) {
        const returned = Math.round(profile.perSearch * (0.5 + rand()));
        const fresh = Math.round(returned * freshShare);
        searches.push({
          scrape_run_id: runId,
          run_at: runAt,
          keyword: profile.keyword,
          portal,
          returned,
          new_jobs: fresh,
          result_cap: 25,
          error: null,
        });
        for (let i = 0; i < fresh; i++) {
          const id = `demo-stat-job-${jobs.length}`;
          const good = rand() < profile.goodRate;
          const chance: Chance = good
            ? rand() < 0.4
              ? "very_good"
              : "good"
            : rand() < 0.55
              ? "fair"
              : "low";
          jobs.push({
            id,
            title: pick(profile.titles),
            platform: portal,
            status:
              good && rand() < 0.25 ? "applied" : !good && rand() < 0.08 ? "not_interested" : null,
            chance,
            blocker: chance === "low" ? pick(LOW_CHANCE_BLOCKERS) : null,
          });
          links.push({ job_id: id, keyword: profile.keyword, discovered: true });
          if (profile.overlapsWith && rand() < (profile.overlapRate ?? 0)) {
            links.push({ job_id: id, keyword: profile.overlapsWith, discovered: false });
          }
        }
      }
    }
  }

  // Scraped before keyword tracking existed — no keyword attached.
  for (let i = 0; i < 37; i++) {
    jobs.push({
      id: `demo-stat-old-${i}`,
      title: "Frontend Developer (m/w/d)",
      platform: pick(STATS_PORTALS),
      status: null,
      chance: pick(CHANCES),
      blocker: null,
    });
  }

  const stats = computeStats({
    jobs,
    jobKeywords: links,
    searches,
    activeKeywords: demoSettings.scraper_search_keywords,
    scrapeRuns: STATS_RUNS + 3,
  });
  return {
    ...stats,
    trackingReady: true,
    suggestions: suggestKeywords(
      jobs,
      stats.keywords.map((k) => k.keyword),
    ),
  };
}

/** Response shape of GET /api/stats. */
export const demoStats: StatsResponse = buildDemoStats();
