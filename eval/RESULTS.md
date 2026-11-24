# Evaluation: chance scoring

Run on 2026-11-24 with `npm run eval`: 30 test postings ([cases.ts](cases.ts)), each scored 3 times by `qwen/qwen3-next-80b-a3b-instruct` through the real scoring code (scoring version 12). Method: [README.md](README.md).

|                                                               |                  |
| ------------------------------------------------------------- | ---------------: |
| **Right tier**                                                | **87/90 (97 %)** |
| Right tier for the right reason                               |     87/90 (97 %) |
| Same tier in all 3 runs                                       |     29/30 (97 %) |
| Jobs without an answer (skipped or failed)                    |                0 |
| Model claims (met/partly met) overruled by the evidence check |      3/252 (1 %) |
| Avg. time per AI call (5 jobs)                                |           16.4 s |
| Cost per job                                                  |         $0.00030 |

## Facts read from the postings

| Fact               |       Correct |
| ------------------ | ------------: |
| arrangement        | 36/36 (100 %) |
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
| `dev-three-years`               | Good             | Good ✓      | Good ✓      | Good ✓      |
| `dev-werkstudent-in-text`       | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-werkstudent-as-experience` | Very good / Good | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-homeoffice-after-cut`      | Very good / Good | Good ✓      | Good ✓      | Good ✓      |
| `dev-alternatives`              | Very good        | Good ✗      | Good ✗      | Good ✗      |
| `dev-java-backend`              | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-english-nice-to-have`      | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-french`                    | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-dealbreaker-sales`         | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-short-posting`             | Fair             | Fair ✓      | Fair ✓      | Fair ✓      |
| `dev-it-support`                | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-praktikum-title`           | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-onsite-oldenburg`          | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `dev-remote-title-office-days`  | Low              | Low ✓       | Low ✓       | Low ✓       |
| `dev-ownership-not-senior`      | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `office-parttime-hannover`      | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `office-fulltime-only`          | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-full-or-part-time`      | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `office-apprenticeship`         | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-shift-work`             | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-bookkeeping-gaps`       | Good / Fair      | Good ✓      | Good ✓      | Fair ✓      |
| `office-spanish`                | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-berlin`                 | Low              | Low ✓       | Low ✓       | Low ✓       |
| `office-remote-parttime`        | Very good        | Very good ✓ | Very good ✓ | Very good ✓ |
| `office-team-lead`              | Low              | Low ✓       | Low ✓       | Low ✓       |

✓ = right tier, right reason and every checked fact right.

## What went wrong

**`dev-alternatives`**: 'Vue.js oder React' is one requirement, met through React.

- Run 1: tier: expected Very good, got Good (Tasks only partly match your experience – at most Good); years: expected 1, got 2
- Run 2: tier: expected Very good, got Good (Tasks only partly match your experience – at most Good); years: expected 1, got 2
- Run 3: tier: expected Very good, got Good (Tasks only partly match your experience – at most Good); years: expected 1, got 2

## Claims the evidence check overruled

- Docker: met → partial (quoted "Docker") (3×)

Total AI cost of this run: $0.0269.
