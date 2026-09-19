# 🔍 AI Job Hunter

[![CI](https://github.com/lvfranek/ai-job-hunter/actions/workflows/ci.yml/badge.svg)](https://github.com/lvfranek/ai-job-hunter/actions/workflows/ci.yml)

Scrapes job boards (Indeed, LinkedIn, Xing, Stepstone, Arbeitsagentur), scores matches against your
profile with an LLM, and helps you generate tailored cover letters. Track each job's application
status (interested, applied, interview, not interested) and filter the list by it. Built with
Next.js and Supabase.

![AI Job Hunter](public/aijobhunter.png)

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Live Demo](#live-demo)
- [⚙️ Installation](#️-installation)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Tests](#tests)
- [Deployment](#deployment)
- [Automation (optional)](#automation-optional)
- [Security Considerations](#security-considerations)
- [Limitations](#limitations)
- [Learn More](#learn-more)
- [License](#license)

## Tech Stack

| Area      | Choice                                                             |
| --------- | ------------------------------------------------------------------ |
| Framework | Next.js 16 (App Router)                                            |
| UI        | React 19                                                           |
| Language  | TypeScript                                                         |
| Styling   | Tailwind CSS v4                                                    |
| Database  | [Supabase](https://supabase.com) (Postgres + RLS)                  |
| Scraping  | [Apify](https://apify.com) job-board actors                        |
| AI        | [OpenRouter](https://openrouter.ai) — LLM match scoring            |
| Documents | `pdf-parse` / `mammoth` (CV parsing), `docx` (cover-letter export) |
| Testing   | Vitest                                                             |
| Icons     | Phosphor Icons                                                     |
| Hosting   | Vercel                                                             |

## Features

- **Multi-board scraping** — Indeed, LinkedIn, Xing, Stepstone and Arbeitsagentur in a single scan.
- **LLM match scoring** — every job is scored 0–100 against your profile, with written reasoning
  for why it fits or doesn't.
- **Tailored cover letters** — generate a cover letter per job, exportable as `.docx`.
- **CV-aware profile** — upload a PDF or Word CV and the app parses it into your matching profile.
- **Application tracking** — mark each job interested / applied / interview / not interested, and
  filter the list by status.
- **Scheduled scans** — `POST /api/cron/scrape` runs a full scrape + score pass, drivable from any
  scheduler (cron, n8n, GitHub Actions).
- **Webhook notifications** — get a JSON summary of new high-fit jobs after each run.
- **Single-user by design** — one password gate protects the whole deployment, with a read-only
  demo mode for visitors.

## Live Demo

[ai-job-hunter-rosy.vercel.app](https://ai-job-hunter-rosy.vercel.app/)

The demo runs in guest mode against canned fixtures — you can click through the whole UI, and no
writes are persisted.

## ⚙️ Installation

**Prerequisites:** Node.js 20.9+ (`.nvmrc` pins the version CI runs), a
[Supabase](https://supabase.com) project, and — for real scraping and scoring —
[Apify](https://apify.com) and [OpenRouter](https://openrouter.ai) accounts.

1. **Clone and install**

   ```bash
   git clone https://github.com/lvfranek/ai-job-hunter.git
   cd ai-job-hunter
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then run every file in
   `supabase/migrations/` against it, in order (via the Supabase SQL editor, or `supabase db push`
   if you use the Supabase CLI).

3. **Copy the env template** and fill in your Supabase project's URL and service role key
   (Project Settings → API in the Supabase dashboard):

   ```bash
   cp .env.local.example .env.local
   ```

4. **Generate the two required app secrets** and paste them into `.env.local`:
   - `CREDENTIALS_ENCRYPTION_KEY` — encrypts any API keys you enter later via the Settings page:
     ```bash
     openssl rand -hex 32
     ```
   - `AUTH_PASSWORD_HASH` — the password that protects your deployment (nobody without it can
     reach the app):
     ```bash
     node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');c.scrypt(process.argv[1],s,64,(e,k)=>console.log(s+':'+k.toString('hex')))" "your-password-here"
     ```

5. **Start the app** and log in with the password you hashed in step 4:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

6. **Add your Apify and OpenRouter API keys** via Settings → API Keys in the app itself — no need
   to touch `.env.local` for these. (You can still set them as env vars instead if you prefer; the
   Settings UI values take priority when both are set.)

## Environment Variables

| Variable                     | Description                                                            | Required            |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`   | Supabase project URL                                                   | Yes                 |
| `SUPABASE_SERVICE_ROLE_KEY`  | Supabase service role key — server-side only, never expose it          | Yes                 |
| `AUTH_PASSWORD_HASH`         | `salt:hash` of your app password (see Installation step 4)             | Yes                 |
| `CREDENTIALS_ENCRYPTION_KEY` | 32-byte hex key encrypting API keys stored in the database             | Yes                 |
| `OPENROUTER_API_KEY`         | OpenRouter key for match scoring                                       | Or set in Settings  |
| `OPENROUTER_MODEL`           | Model id — use a fast **instruct** model, not a reasoning one          | Or set in Settings  |
| `APIFY_API_KEY`              | Apify token for the scraper actors                                     | Or set in Settings  |
| `APIFY_SCRAPER_*`            | Actor id per board (Indeed, LinkedIn, Xing, Stepstone, Arbeitsagentur) | Or set in Settings  |
| `CRON_SECRET`                | Bearer token for `POST /api/cron/scrape`                               | Only for automation |
| `NOTIFICATION_WEBHOOK_URL`   | Receives a JSON summary of new high-fit jobs                           | No                  |

## Available Scripts

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Start the development server            |
| `npm run build`     | Production build                        |
| `npm run start`     | Serve the production build              |
| `npm run lint`      | ESLint                                  |
| `npm run typecheck` | TypeScript check without emitting files |
| `npm test`          | Run the Vitest suite                    |
| `npm run format`    | Format the repo with Prettier           |

## Tests

Unit tests cover the pure logic that is easiest to get subtly wrong: the HTML-to-Markdown
conversion for scraped postings (`text-format`), the LLM scoring-response parser and chunking
(`agents/agent-3`), and `.docx` cover-letter generation. They run in CI on every push and pull
request.

```bash
npm test
```

## Deployment

The reference deployment runs on [Vercel](https://vercel.com), connected directly to this GitHub
repo — push to your default branch and it redeploys.

Set every variable from `.env.local.example` in **Project Settings → Environment Variables**. Use
the exact same `AUTH_PASSWORD_HASH` and `CREDENTIALS_ENCRYPTION_KEY` values you generated locally —
regenerating them on Vercel would lock you out of your own password and make any API keys already
stored in Supabase undecryptable.

Always serve the app over HTTPS (Vercel and most hosts do this automatically) — the login cookie is
only meaningful over an encrypted connection.

## Automation (optional)

`POST /api/cron/scrape` runs a full scrape + score pass and waits for it to finish before
responding — unlike the "Scan now" button in the UI, which fires in the background. Point any
scheduler at it: a cron job, [n8n](https://n8n.io), Zapier, a scheduled GitHub Action, whatever
you already use. The app doesn't depend on a specific one.

1. Generate a secret and set it as `CRON_SECRET` in your env:
   ```bash
   openssl rand -hex 32
   ```
2. Call the endpoint with it as a bearer token, on whatever schedule you like:

   ```bash
   curl -X POST https://your-app.vercel.app/api/cron/scrape \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   Response: `{ "runId": "...", "jobsFound": 12, "jobsStored": 9, "jobsScored": 9, "notified": true }`

   Returns 401 if the bearer token is missing or doesn't match `CRON_SECRET`.

### Webhook notifications

Set `NOTIFICATION_WEBHOOK_URL` to have the app POST a summary of newly-scored high-fit jobs after
each cron run (leave it unset to skip this — the cron endpoint works fine without it). The score
threshold is set in Settings → Notifications (default 75). Each job is only ever notified once,
even if it gets rescored later. Any receiver that accepts a JSON POST works — a Slack/Discord
webhook relay, [webhook.site](https://webhook.site) for testing, your own endpoint, etc.

Payload shape:

```json
{
  "event": "new_jobs",
  "count": 1,
  "jobs": [
    {
      "title": "Senior React Developer",
      "company": "TechCorp GmbH",
      "url": "https://...",
      "platform": "indeed",
      "score": 87,
      "reasoning": "Matches React and TypeScript, remote, senior level",
      "postedDate": "2026-08-14"
    }
  ]
}
```

### Recommended settings for automated scraping

If you point a scheduler at the cron endpoint on a recurring basis (e.g. every 2 hours during work
hours), these starting values in Settings keep it useful without wasting Apify credits:

| Setting                | Recommended value | Why                                                                                    |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Results per scan       | 20                | Covers realistic daily posting volume per portal without wasting Apify credits         |
| Max posting age (days) | 2                 | Keeps results fresh for time-sensitive applications, avoids re-scraping stale listings |
| Notification threshold | 75                | Only notifies on genuinely strong matches, avoids notification fatigue                 |

Tune these after a few days based on actual `scrape_runs` data (duplicate rate, jobs found vs.
stored).

## Security Considerations

- **Password gate** — a single hashed password (`AUTH_PASSWORD_HASH`, scrypt) protects every page
  and API route via `src/proxy.ts`. Login attempts are rate limited to 10 per 10 minutes per IP.
- **Database access** — all queries run server-side with the service role key; the Supabase
  anon key is deliberately not used anywhere in the app. Row Level Security is enabled on every
  table, scoped to the single hardcoded app user (`supabase/migrations/015_enable_rls.sql`).
- **Stored API keys** — the Apify and OpenRouter keys you enter in Settings are encrypted with
  `CREDENTIALS_ENCRYPTION_KEY` (AES-256-GCM) before they touch the database.
- **Security headers** — CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and
  `Permissions-Policy` are set in `next.config.ts`.
- **Cron endpoint** — bypasses the password gate (external schedulers can't hold a login cookie)
  but requires its own bearer token instead; never expose `CRON_SECRET` in client-side code.
- **Webhook URL** — `NOTIFICATION_WEBHOOK_URL` has no auth on the receiving end by default; treat
  the URL itself as a secret, since anyone who has it can see your job matches.

## Limitations

- **Single user, one password.** There is no sign-up, no accounts and no multi-tenancy — the RLS
  policies are pinned to one hardcoded user id rather than `auth.uid()`. Making this multi-user
  would mean introducing Supabase Auth and rewriting those policies.
- **Scraping depends on third-party actors.** Job boards change their markup; when an Apify actor
  breaks, that board silently returns fewer results until the actor is updated.
- **Scoring costs money and varies.** Each scan sends postings to an LLM. Results are not perfectly
  reproducible between runs, which is why scores can shift slightly on a rescore.

## Learn More

- [Next.js documentation](https://nextjs.org/docs)
- [Supabase documentation](https://supabase.com/docs)
- [Apify documentation](https://docs.apify.com)
- [OpenRouter documentation](https://openrouter.ai/docs)

## License

MIT — see [LICENSE](LICENSE).
