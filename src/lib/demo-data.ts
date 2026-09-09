// Fixtures for guest/demo mode. Everything a demo visitor sees comes from here —
// no Supabase, no Apify, no OpenRouter, no webhook. See src/app/api/demo and
// src/proxy.ts for how these get served.
import type {
  DbJob,
  JobMatch,
  JobWithMatch,
  Preferences,
  Profile,
  Settings,
} from "@/lib/types";
import type { ParsedProfile } from "@/lib/agents/agent-1";
import type { CoverLetterLanguage } from "@/lib/agents/agent-4";

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
  /** The job's match score. `unscored` hides it in the initial dashboard view. */
  score: number;
  unscored?: boolean;
  stale?: boolean;
  skillOverlap?: number;
  seniorityFit?: number;
  locationFit?: number;
  employmentFit?: number;
  blocker?: string;
  reasoning?: string;
}

// 16 fictional postings — real-sounding but invented companies (no impersonation).
// Spread across all 5 platforms, all 5 status values, high/mid/low scores, plus
// 2 not-yet-scored and 1 stale so the "Adjust score" button has something to do.
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
    score: 91,
    reasoning:
      "Strong overlap on React/TypeScript/Next.js and the role is explicitly product-focused with a design culture, which matches the candidate's notes.",
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
    score: 84,
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
    score: 78,
    reasoning:
      "Good frontend fit and the candidate is open to Vue roles, but the stack is Vue-first rather than React, so slightly below the top tier.",
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
    score: 82,
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
    score: 41,
    reasoning:
      "The candidate's notes explicitly rule out Django-heavy backend roles. Frontend exposure here is minimal.",
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
    score: 66,
    reasoning:
      "The candidate has solid Docker / GitHub Actions / AWS exposure but this is a dedicated platform role, not a product-frontend one.",
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
    score: 73,
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
    score: 88,
    reasoning:
      "Almost exactly the work the candidate describes doing before (built a shared component library used by four teams). Strong match on stack and seniority.",
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
    score: 80,
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
    score: 28,
    reasoning:
      "PHP/Laravel agency role — ruled out by the candidate's notes on both the stack and agency churn.",
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
    score: 54,
    reasoning:
      "Frontend role but Angular-first; the candidate's strengths are in the React ecosystem and no Angular is listed.",
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
    score: 93,
    stale: true,
    reasoning:
      "Remote-EU, senior React, product SaaS — ticks every box in the candidate's notes.",
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
    score: 47,
    reasoning:
      "Working-student position — well below the candidate's experience level and hours.",
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
    score: 58,
    unscored: true,
    reasoning:
      "Infrastructure-focused role with limited frontend work; partial overlap on Docker and AWS only.",
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
    score: 86,
    unscored: true,
    reasoning:
      "Next.js + TypeScript + Tailwind storefront work with an explicit performance focus — matches the candidate's LCP-optimisation experience closely.",
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
    score: 62,
    reasoning:
      "Management-track role; the candidate has led a migration but hasn't managed people, and the notes point at a senior IC path.",
  },
];

const clampDemoScore = (n: number) => Math.max(15, Math.min(98, Math.round(n)));

function buildMatch(seed: JobSeed): JobMatch {
  return {
    id: `demo-match-${seed.slug}`,
    job_id: `demo-job-${seed.slug}`,
    user_id: DEMO_USER_ID,
    match_score: seed.score,
    // These are 0-100 like match_score. The old fallbacks divided the score by
    // 12/14 and produced single digits — harmless while nothing rendered them,
    // wrong now that JobCard shows the breakdown.
    skill_overlap_pct: seed.skillOverlap ?? clampDemoScore(seed.score - 6),
    seniority_fit: seed.seniorityFit ?? clampDemoScore(seed.score + 4),
    location_fit: seed.locationFit ?? clampDemoScore(seed.score + 12),
    employment_fit: seed.employmentFit ?? 100,
    blocker: seed.blocker ?? null,
    reasoning:
      seed.reasoning ??
      "Demo data — the AI scorer does not run in guest mode, so this reasoning is illustrative.",
    stale_at: null,
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
    posted_date: daysAgoIso(seed.postedDaysAgo),
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

export const demoPreferences: Preferences = {
  id: "demo-preferences",
  user_id: DEMO_USER_ID,
  notes:
    "Mid-to-senior frontend developer, strong in React, TypeScript and Next.js, comfortable " +
    "writing Node.js APIs on the backend. Open to Vue or Svelte teams. Drawn to product companies " +
    "with a real design culture that ship to users weekly. Not interested in Django/PHP-heavy " +
    "backends, agency/consultancy churn, or gambling/gaming.",
  own_skills: "React, TypeScript, Next.js, Node.js, Tailwind CSS, Git, PostgreSQL, Figma",
  preferred_languages: "TypeScript, JavaScript",
  soft_skills_flexible: true,
  preferred_location: "Berlin, Germany (or remote within the EU)",
  job_type: ["remote", "hybrid"],
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
  notification_threshold: 80,
  created_at: daysAgoIso(45),
  updated_at: daysAgoIso(6),
};

const DEMO_CV_TEXT = [
  "Alex Demo — Frontend Developer",
  "Berlin, Germany · alex.demo@example.com · +49 30 1234567",
  "",
  "SUMMARY",
  "Frontend developer with 5 years' experience building product UIs in React and TypeScript. " +
    "Currently at a Berlin SaaS scale-up, looking for a mid-to-senior product role with a strong design culture.",
  "",
  "EXPERIENCE",
  "Frontend Developer — Meridian SaaS GmbH, Berlin (2022–present)",
  "- Cut the main app's Largest Contentful Paint from 4.1s to 1.3s by reworking the data-fetching layer and code-splitting the dashboard.",
  "- Led the migration of a 120k-line codebase from Create React App to the Next.js App Router with zero downtime.",
  "- Built the company's first shared component library, now used by four product teams.",
  "",
  "Junior Frontend Developer — Kleinbahn Interactive, Leipzig (2020–2022)",
  "- Shipped customer-facing features in React and Redux for an e-commerce platform.",
  "- Introduced Storybook and visual regression tests to the team.",
  "",
  "SKILLS",
  "React, TypeScript, Next.js, Redux, Tailwind CSS, Vitest, Playwright, Node.js, Express, PostgreSQL, Prisma, Docker, GitHub Actions, Figma",
  "",
  "EDUCATION",
  "B.Sc. Media Informatics — HTWK Leipzig (2020)",
  "",
  "LANGUAGES",
  "German (native), English (fluent), Spanish (basic)",
].join("\n");

export const demoProfile: Profile = {
  id: "demo-profile",
  user_id: DEMO_USER_ID,
  name: "Alex Demo",
  email: "alex.demo@example.com",
  phone: "+49 30 1234567",
  date_of_birth: "1994-05-12",
  languages: [
    { name: "German", level: "native" },
    { name: "English", level: "fluent" },
    { name: "Spanish", level: "basic" },
  ],
  location: "10405 Berlin",
  street_address: "Beispielstraße 12",
  cv_text: DEMO_CV_TEXT,
  current_situation:
    "Frontend developer with 5 years' experience, currently at a Berlin SaaS scale-up, looking for a mid-to-senior product role.",
  skills_frontend: [
    "React",
    "TypeScript",
    "Next.js",
    "Redux",
    "Tailwind CSS",
    "Vitest",
    "Playwright",
  ],
  skills_backend: ["Node.js", "Express", "PostgreSQL", "Prisma", "REST", "GraphQL"],
  skills_devops: ["Docker", "GitHub Actions", "Vercel", "AWS (S3, Lambda)"],
  skills_tools: ["Figma", "Jira", "Storybook", "Linear"],
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

/** Response shape of POST /api/profile/parse (ParsedProfile + cv_text). */
export const demoParsedCv: ParsedProfile & { cv_text: string } = {
  name: "Alex Demo",
  email: "alex.demo@example.com",
  phone: "+49 30 1234567",
  location: "Berlin, Germany",
  languages: ["German", "English", "Spanish"],
  current_situation: "Frontend developer, 5 years experience",
  skills_frontend: demoProfile.skills_frontend,
  skills_backend: demoProfile.skills_backend,
  skills_devops: demoProfile.skills_devops,
  skills_tools: demoProfile.skills_tools,
  cv_text: DEMO_CV_TEXT,
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
    openrouter_model: "mistralai/mistral-nemo",
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
