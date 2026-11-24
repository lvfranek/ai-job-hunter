# Evaluation: chance scoring

Run on 2026-11-24 with `npm run eval`: 30 test postings ([cases.ts](cases.ts)), each scored 3 times by `qwen/qwen3-next-80b-a3b-instruct` through the real scoring code (scoring version 11). Method: [README.md](README.md).

|                                                               |                  |
| ------------------------------------------------------------- | ---------------: |
| **Right tier**                                                | **78/90 (87 %)** |
| Right tier for the right reason                               |     78/90 (87 %) |
| Same tier in all 3 runs                                       |     27/30 (90 %) |
| Jobs without an answer (skipped or failed)                    |                0 |
| Model claims (met/partly met) overruled by the evidence check |     17/259 (7 %) |
| Avg. time per AI call (5 jobs)                                |           12.6 s |
| Cost per job                                                  |         $0.00030 |

## Facts read from the postings

| Fact               |       Correct |
| ------------------ | ------------: |
| arrangement        |  33/36 (92 %) |
| contract           | 18/18 (100 %) |
| years              |  27/30 (90 %) |
| level              | 12/12 (100 %) |
| work time          | 15/15 (100 %) |
| requirement status | 30/30 (100 %) |

## Per case

| Case                            | Expected         | Run 1       | Run 2       | Run 3       |
| ------------------------------- | ---------------- | ----------- | ----------- | ----------- |
| `dev-remote-clear`              | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-hybrid-bremen`             | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-hybrid-munich`             | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-senior-title`              | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-five-years`                | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-three-years`               | Good             | Low ✗       | Good ✓      | Good ✓      |
| `dev-werkstudent-in-text`       | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-werkstudent-as-experience` | Very good / Good | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-homeoffice-after-cut`      | Very good / Good | Low ✗       | Low ✗       | Low ✗       |
| `dev-alternatives`              | Very good        | Very good ✗ | Very good ✗ | Very good ✗ |
| `dev-java-backend`              | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-english-nice-to-have`      | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-french`                    | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-dealbreaker-sales`         | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-short-posting`             | Fair             | Fair ✓      | Fair ✓      | Fair ✓      |
| `dev-it-support`                | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-praktikum-title`           | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-onsite-oldenburg`          | Very good        | Very good ✓ | Good ✗      | Good ✗      |
| `dev-remote-title-office-days`  | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-ownership-not-senior`      | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `office-parttime-hannover`      | Very good        | Good ✗      | Good ✗      | Good ✗      |
| `office-fulltime-only`          | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-full-or-part-time`      | Very good        | Good ✗      | Good ✗      | Good ✗      |
| `office-apprenticeship`         | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-shift-work`             | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-bookkeeping-gaps`       | Good / Fair      | Good ✓      | Fair ✓      | Good ✓      |
| `office-spanish`                | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-berlin`                 | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-remote-parttime`        | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `office-team-lead`              | Low              | Low ✓       | Low ✓       | Low ✓       |

✓ = right tier, right reason and every checked fact right.

## What went wrong

**`dev-three-years`**: Everything fits except one year of experience (3 asked, 2 there): at most Good.

- Run 1: tier: expected Good, got Low (Senior role – your level is Junior)

**`dev-homeoffice-after-cut`**: 'Homeoffice möglich' only appears after the 3000-character cut; the snippet logic must keep it, else the Hamburg office makes it Low.

- Run 1: tier: expected Very good or Good, got Low (Office in Hamburg, 75 km away – you want within 25 km of Oldenburg or 25 km of Bremen); arrangement: expected remote, got hybrid
- Run 2: tier: expected Very good or Good, got Low (Office in Hamburg, 75 km away – you want within 25 km of Oldenburg or 25 km of Bremen); arrangement: expected remote, got hybrid
- Run 3: tier: expected Very good or Good, got Low (Office in Hamburg, 75 km away – you want within 25 km of Oldenburg or 25 km of Bremen); arrangement: expected remote, got hybrid

**`dev-alternatives`**: 'Vue.js oder React' is one requirement, met through React.

- Run 1: years: expected 1, got 2
- Run 2: years: expected 1, got 2
- Run 3: years: expected 1, got 2

**`dev-onsite-oldenburg`**: On site only, but in Oldenburg, inside the radius. The place decides, not the arrangement.

- Run 2: tier: expected Very good, got Good
- Run 3: tier: expected Very good, got Good

**`office-parttime-hannover`**: Part-time in Hannover, all must-haves met. Trap: 'abgeschlossene Ausbildung' is a requirement, not an apprenticeship.

- Run 1: tier: expected Very good, got Good
- Run 2: tier: expected Very good, got Good
- Run 3: tier: expected Very good, got Good

**`office-full-or-part-time`**: Offered as full- or part-time, so part-time is fine; hybrid in Hannover.

- Run 1: tier: expected Very good, got Good
- Run 2: tier: expected Very good, got Good
- Run 3: tier: expected Very good, got Good

## Claims the evidence check overruled

- Kaufmännische Ausbildung: met → partial (quoted "Kauffrau für Büromanagement") (11×)
- Abgeschlossene kaufmännische Ausbildung: met → partial (quoted "Kauffrau für Büromanagement") (4×)
- Erste Berufserfahrung in der Softwareentwicklung: met → partial (quoted "2") (2×)

Total AI cost of this run: $0.0270.
