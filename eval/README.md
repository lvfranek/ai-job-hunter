# Evaluation: does the chance scoring work?

**Question:** For a given job posting and candidate, does the app put the job in the right
chance tier (Low, Fair, Good, Very good), for the right reason, and does it give the same answer
every time?

```bash
npm run eval                        # 30 postings × 3 runs, ~3 cents, ~1 minute
npm run eval -- --runs 1            # one run
npm run eval -- --only dev-french   # quick check of some cases (nothing is saved)
```

Needs `OPENROUTER_API_KEY` in `.env.local` (or stored via Settings → API Keys).

## Method

- **30 test postings** in [cases.ts](cases.ts), all made up, for two candidates: a junior
  developer (remote, or within 25 km of Oldenburg or Bremen) and an office worker (part-time
  only, within 20 km of Hannover). The second one checks that the app isn't tuned for software
  jobs only.
- Almost every posting hides a **trap**: "Werkstudent" only in the text, not the title;
  "Werkstudentenjob" as an example of experience in a regular job; home office mentioned only
  after the 3000-character cut; "Remote" in the title but office days in the text; nice-to-haves
  that must not count; "abgeschlossene Ausbildung" as a requirement, not an apprenticeship.
- Every posting runs through the **real scoring code**: the same prompt, model, chunks of 5,
  evidence check, place data and rules as the app ([run.ts](run.ts)). Only the database is
  left out.
- **Three runs** per posting, to measure stability as well as correctness.
- The expected tier of each case is the one the app's own rules
  (`src/lib/scoring-rules.ts`) give when the posting is read correctly. A case can allow two
  tiers when both are fair readings. The expected _reason_ is checked too: a job that is Low
  because of the distance, when it should be Low because of the contract form, doesn't count.

**Metrics:** right tier; right tier for the right reason; same tier in all runs; facts read
correctly (work arrangement, contract form, required years, level, working time, single
requirements); how many "met" or "partly met" claims the evidence check overruled; time and
cost per job.

## Results

Latest run: [RESULTS.md](RESULTS.md). Every saved run: [results/](results/).

| Scoring version | Change                          | Right tier | Same tier in all 3 runs | Cost per job |
| --------------- | ------------------------------- | ---------- | ----------------------- | ------------ |
| v11             | Baseline, first run of the eval | 87 %       | 90 %                    | $0.0003      |

## What the first run found

1. **Degrees are checked too strictly.** "Kaufmännische Ausbildung", proved by "Kauffrau für
   Büromanagement", is only partly met: the evidence check wants a shared word for anything
   specific. That cost the office worker Very good on two postings, in every run.
2. **"Erste Berufserfahrung" is treated as a skill.** Years of experience are meant to be judged
   by the experience rule alone. This phrase has no number, so it slips past the filter, the
   model quotes "2" (the years) as evidence, and the requirement ends up partly met.
3. **"Office + home office possible" is read as hybrid.** The prompt says a general home office
   mention counts as remote unless fixed office days are named. With "Moderne Büros in Hamburg"
   in the same list, the model answers hybrid anyway, and the job becomes Low for the distance.
4. **The same posting doesn't always get the same tier,** despite temperature 0 and a fixed seed.
   3 of 30 postings moved between runs. Once, a 3-year mid-level posting was called senior.
5. **The eval had a bug too.** In the very first run one test posting was 283 characters long,
   under the app's 300-character "too little description" rule. That was the test's fault, not
   the app's; it was fixed before the run above.

## Limitations

- The postings and expected tiers were written by hand, for two profiles. They test whether the
  app does what its rules say, not whether those rules are good career advice.
- 30 cases are enough to find systematic mistakes, not to give a precise accuracy figure: one
  case is about 3 percentage points.
- Model output varies between runs, so two runs of the same version can differ by a case or two.
