"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/Checkbox";
import { ChancePill } from "@/components/ChanceBadge";
import { WorkLocationsField, type LocationRow } from "@/components/WorkLocationsField";
import {
  CheckboxRow,
  DEMO_SAVE_MESSAGE,
  ErrorBanner,
  Field,
  FieldGroup,
  PageHeader,
  SaveBar,
  SettingsSection,
  textareaClass,
  textInputClass,
} from "@/components/form";
import {
  acceptsOfficeWork,
  DEFAULT_PREFERENCES,
  EXCLUDABLE_CONTRACTS,
  isReadyForScoring,
  JOB_TYPES,
  MAX_BACKGROUND_CHARS,
  TARGET_LEVELS,
  WORK_TIME_MODELS,
  type PreferencesInput,
} from "@/lib/preferences";
import { useDirtyGuard } from "@/lib/unsaved-changes";

// Years and radii are edited as text so a field can be empty and take "1.5";
// the API parses them back into numbers.
type PreferencesForm = Omit<
  PreferencesInput,
  "experience_years" | "max_required_years" | "work_locations"
> & {
  experience_years: string;
  max_required_years: string;
  work_locations: LocationRow[];
};

const OPTION_LABELS: Record<string, string> = {
  junior: "Junior / entry level",
  mid: "Mid-level",
  senior: "Senior / lead",
  freelance: "Freelance",
  ausbildung: "Apprenticeship",
  studium: "Dual study",
  werkstudent: "Working student",
  praktikum: "Internship",
  vollzeit: "Full-time",
  teilzeit: "Part-time",
  minijob: "Minijob",
};

const DEFAULTS: PreferencesForm = {
  ...DEFAULT_PREFERENCES,
  experience_years: "",
  max_required_years: "",
  work_locations: [],
};

const text = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) => (Array.isArray(value) ? (value as string[]) : []);
const yearsText = (value: unknown) =>
  value === null || value === undefined || value === "" ? "" : String(value);

function locationRows(value: unknown): LocationRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const place = text(entry.place);
    return place ? [{ place, radius: yearsText(entry.radius_km) || "25" }] : [];
  });
}

function toForm(data: Record<string, unknown>): PreferencesForm {
  return {
    notes: text(data.notes),
    dealbreakers: text(data.dealbreakers),
    experience_years: yearsText(data.experience_years),
    target_levels: list(data.target_levels),
    max_required_years: yearsText(data.max_required_years),
    background: text(data.background),
    own_skills: text(data.own_skills),
    basic_skills: text(data.basic_skills),
    education: text(data.education),
    certifications: text(data.certifications),
    spoken_languages: text(data.spoken_languages),
    job_type: list(data.job_type),
    work_locations: locationRows(data.work_locations),
    excluded_employment_types: list(data.excluded_employment_types),
    work_time_models: list(data.work_time_models),
  };
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function isYears(value: string): boolean {
  if (!value.trim()) return true;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0;
}

/** What each tier means, so the badges on the dashboard never feel arbitrary. */
function HowChancesWork() {
  return (
    <SettingsSection
      title="How your chance is decided"
      description={
        <p>
          The AI checks each posting&apos;s must-have requirements against your profile below. The
          tier itself is calculated from that checklist with fixed rules, so it stays stable instead
          of drifting between runs.
        </p>
      }
    >
      <ul className="space-y-2.5 text-[13px] leading-relaxed text-[#1E2A3D]">
        <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
          <span className="shrink-0 sm:w-36">
            <ChancePill chance="very_good" />
          </span>
          <span>You meet every must-have (at most one only partly) and nothing holds it back.</span>
        </li>
        <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
          <span className="shrink-0 sm:w-36">
            <ChancePill chance="good" />
          </span>
          <span>
            You cover most must-haves, or one thing caps it — e.g. the posting asks for one year
            more experience than you have.
          </span>
        </li>
        <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
          <span className="shrink-0 sm:w-36">
            <ChancePill chance="fair" />
          </span>
          <span>
            Clear gaps, but still possible — e.g. two years more experience asked, or tasks that
            differ from what you&apos;ve done so far.
          </span>
        </li>
        <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
          <span className="shrink-0 sm:w-36">
            <ChancePill chance="low" />
          </span>
          <span>
            A hard blocker — wrong work arrangement or contract form, three or more years of
            experience missing, a mandatory licence or language you don&apos;t have, one of your
            dealbreakers — or most must-haves missing.
          </span>
        </li>
      </ul>
    </SettingsSection>
  );
}

export default function PreferencesPage() {
  const [form, setForm] = useState<PreferencesForm>(DEFAULTS);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set from the saved row, not the form: the banner is about what the scorer
  // sees, and shouldn't vanish the moment you start typing.
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  useDirtyGuard(!loading && JSON.stringify(form) !== savedSnapshot);

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        const next = toForm(data && typeof data === "object" ? data : {});
        setForm(next);
        setSavedSnapshot(JSON.stringify(next));
        setNeedsUpgrade(!next.experience_years.trim() || !isReadyForScoring(next));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const set = <K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    setError(null);
    if (!isReadyForScoring(form))
      return setError("Add your skills or paste your CV — the AI needs something to compare with");
    if (!form.experience_years.trim())
      return setError("Add your years of relevant experience (0 is fine)");
    if (!isYears(form.experience_years) || !isYears(form.max_required_years))
      return setError("Years must be a number, e.g. 1 or 1.5");

    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          experience_years: form.experience_years.replace(",", "."),
          max_required_years: form.max_required_years.replace(",", "."),
          work_locations: form.work_locations
            .filter((row) => row.place.trim())
            .map((row) => ({ place: row.place, radius_km: row.radius })),
        }),
      });
      const data = await res.json().catch(() => null);
      // The server names the problem, e.g. a city it couldn't find.
      if (!res.ok) throw new Error(data?.error || "Failed to save preferences");
      // The server stores each city under its proper name ("hamburg" → "Hamburg").
      const saved = { ...form, work_locations: locationRows(data?.work_locations) };
      setForm(saved);
      setSavedSnapshot(JSON.stringify(saved));
      setNeedsUpgrade(false);
      setMessage(data?.demo ? DEMO_SAVE_MESSAGE : "Preferences saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = !loading && JSON.stringify(form) !== savedSnapshot;

  return (
    <main id="main" tabIndex={-1} className="px-4 pt-3 pb-8 sm:pt-8 sm:pr-4 sm:pb-4 sm:pl-0">
      <PageHeader
        title="AI Scoring Preferences"
        description="Your profile for judging every job — works for any profession. Changing it marks all scores as outdated; rescore anytime from the dashboard."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && needsUpgrade && (
        <div className="mb-4 rounded-xl border border-sky-300 bg-sky-100 px-3.5 py-2.5 text-[13px] text-sky-900">
          Jobs are now rated by chance, based on the profile below. Fill in your experience, skills
          and CV, and move anything you don&apos;t want into Dealbreakers — scoring starts once your
          skills or CV are filled in.
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="space-y-4">
          <HowChancesWork />

          <SettingsSection
            title="What you're looking for"
            description={
              <p>
                Job titles don&apos;t matter here — the AI compares what a job actually involves
                with your CV and with what you describe. English or German both work.
              </p>
            }
          >
            <Field
              label="Your ideal job, in your own words"
              htmlFor="prefs-notes"
              hint={<p>Optional. The kind of work, industries, kind of company.</p>}
            >
              <textarea
                id="prefs-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={4}
                placeholder="e.g. A product company where I build user-facing features, ideally in e-commerce or health."
                className={textareaClass}
              />
            </Field>

            <Field
              label="Dealbreakers"
              htmlFor="prefs-dealbreakers"
              hint={
                <p>
                  What you never want. A posting that clearly matches one is rated Low chance and
                  says why.
                </p>
              }
            >
              <textarea
                id="prefs-dealbreakers"
                value={form.dealbreakers}
                onChange={(e) => set("dealbreakers", e.target.value)}
                rows={3}
                placeholder="e.g. No cold calling or sales targets, no shift work, nothing in gambling."
                className={textareaClass}
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            title="Experience & level"
            description={
              <p>
                Applied as fixed rules: one year short of what a posting asks caps it at Good, two
                years at Fair, three or more makes it Low.
              </p>
            }
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Years of relevant experience"
                htmlFor="prefs-experience-years"
                hint={
                  <p>
                    Professional experience in the kind of job you&apos;re looking for. A relevant
                    working-student job counts too; as a career changer, count only what transfers.
                  </p>
                }
              >
                <input
                  id="prefs-experience-years"
                  inputMode="decimal"
                  value={form.experience_years}
                  onChange={(e) => set("experience_years", e.target.value)}
                  placeholder="e.g. 1.5"
                  className={`${textInputClass} max-w-40`}
                />
              </Field>

              <Field
                label="Most years a job may require"
                htmlFor="prefs-max-required-years"
                hint={
                  <p>
                    Optional hard limit in years. A posting that requires more is always Low chance.
                  </p>
                }
              >
                <input
                  id="prefs-max-required-years"
                  inputMode="decimal"
                  value={form.max_required_years}
                  onChange={(e) => set("max_required_years", e.target.value)}
                  placeholder="e.g. 2"
                  className={`${textInputClass} max-w-40`}
                />
              </Field>
            </div>

            <FieldGroup
              legend="Levels you're targeting"
              hint={
                <p>
                  A senior role is Low chance unless you tick Senior. Tick nothing and the levels
                  follow from your experience: under 2 years junior, under 5 up to mid-level.
                </p>
              }
            >
              <CheckboxRow>
                {TARGET_LEVELS.map((level) => (
                  <Checkbox
                    key={level}
                    label={OPTION_LABELS[level]}
                    checked={form.target_levels.includes(level)}
                    onChange={() => set("target_levels", toggleValue(form.target_levels, level))}
                  />
                ))}
              </CheckboxRow>
            </FieldGroup>
          </SettingsSection>

          <SettingsSection
            title="Your background"
            description={
              <p>
                Paste your CV here — each position with the tasks you did, education, projects,
                volunteering. The AI compares every job&apos;s tasks and requirements with it, so
                the more concrete, the better.
              </p>
            }
          >
            <Field
              label="CV / work history"
              htmlFor="prefs-background"
              hint={
                <p>
                  {form.background.length.toLocaleString("en-US")} /{" "}
                  {MAX_BACKGROUND_CHARS.toLocaleString("en-US")} characters
                </p>
              }
            >
              <textarea
                id="prefs-background"
                value={form.background}
                onChange={(e) => set("background", e.target.value.slice(0, MAX_BACKGROUND_CHARS))}
                rows={12}
                placeholder={
                  "e.g.\n2023–today  Junior Frontend Developer, Acme GmbH — built the customer portal in React/TypeScript, " +
                  "ran usability tests\n2020–2023  B.Sc. Media Informatics, HTW Berlin\n2019  Internship, local agency — WordPress sites"
                }
                className={textareaClass}
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            title="Skills & qualifications"
            description={
              <p>
                Each posting&apos;s must-haves are checked against this. Strong skills count as met,
                basics as partly met. A mandatory licence or language you don&apos;t list makes a
                job Low chance.
              </p>
            }
          >
            <Field
              label="Skills you're strong in"
              htmlFor="prefs-own-skills"
              hint={
                <p>
                  Tools, software, methods, machines, programming languages — what you can do today.
                  If you list programming languages, a job built on one you don&apos;t list is Low
                  chance.
                </p>
              }
            >
              <textarea
                id="prefs-own-skills"
                value={form.own_skills}
                onChange={(e) => set("own_skills", e.target.value)}
                rows={3}
                placeholder="e.g. React, TypeScript, Figma, SQL — or: Wundversorgung, SAP MM, Staplerfahren"
                className={textareaClass}
              />
            </Field>

            <Field
              label="Skills you know the basics of"
              htmlFor="prefs-basic-skills"
              hint={
                <p>Courses, hobby projects, things you&apos;ve touched but not used at work.</p>
              }
            >
              <textarea
                id="prefs-basic-skills"
                value={form.basic_skills}
                onChange={(e) => set("basic_skills", e.target.value)}
                rows={2}
                placeholder="e.g. Node.js, Docker, Python"
                className={textareaClass}
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Education" htmlFor="prefs-education">
                <input
                  id="prefs-education"
                  value={form.education}
                  onChange={(e) => set("education", e.target.value)}
                  placeholder="e.g. B.Sc. Computer Science; Ausbildung Kauffrau für Büromanagement"
                  className={textInputClass}
                />
              </Field>

              <Field label="Certificates & licences" htmlFor="prefs-certifications">
                <input
                  id="prefs-certifications"
                  value={form.certifications}
                  onChange={(e) => set("certifications", e.target.value)}
                  placeholder="e.g. Führerschein B, Staplerschein, AWS Cloud Practitioner"
                  className={textInputClass}
                />
              </Field>
            </div>

            <Field label="Languages you speak" htmlFor="prefs-spoken-languages">
              <input
                id="prefs-spoken-languages"
                value={form.spoken_languages}
                onChange={(e) => set("spoken_languages", e.target.value)}
                placeholder="e.g. German native, English C1, Spanish A2"
                className={textInputClass}
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            title="Location & job type"
            description={<p>How you want to work — and for hybrid or on-site jobs, where.</p>}
          >
            <FieldGroup
              legend="Job type"
              hint={<p>A posting with any other arrangement is Low chance. Tick none for any.</p>}
            >
              <CheckboxRow>
                {JOB_TYPES.map((type) => (
                  <Checkbox
                    key={type}
                    label={type}
                    checked={form.job_type.includes(type)}
                    onChange={() => set("job_type", toggleValue(form.job_type, type))}
                  />
                ))}
              </CheckboxRow>
            </FieldGroup>

            {acceptsOfficeWork(form.job_type) ? (
              <FieldGroup
                legend="Where you'd work on site"
                hint={
                  <>
                    <p>
                      Anywhere in the city counts, plus this distance around it, as the crow flies.
                      Hybrid and on-site jobs further away are Low chance; remote jobs are never
                      limited. Add no city to accept any location.
                    </p>
                    <p>
                      Place data ©{" "}
                      <a
                        href="https://www.geonames.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        GeoNames
                      </a>
                      ,{" "}
                      <a
                        href="https://creativecommons.org/licenses/by/4.0/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        CC BY 4.0
                      </a>
                      .
                    </p>
                  </>
                }
              >
                <WorkLocationsField
                  rows={form.work_locations}
                  onChange={(rows) => set("work_locations", rows)}
                />
              </FieldGroup>
            ) : (
              <p className="text-[12px] text-text-faint">
                Only fully remote jobs — no location needed.
              </p>
            )}
          </SettingsSection>

          <SettingsSection
            title="Contract & working time"
            description={<p>Filter out contract forms and working hours you don&apos;t want.</p>}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup
                legend="Exclude contract forms"
                hint={
                  <p>
                    Tick what you do <strong>not</strong> want — freelance, apprenticeship
                    (Ausbildung), dual study (duales Studium), working student (Werkstudent),
                    internship (Praktikum). Those postings are Low chance and say why. Tick nothing
                    to accept every contract form.
                  </p>
                }
              >
                <CheckboxRow>
                  {EXCLUDABLE_CONTRACTS.map((type) => (
                    <Checkbox
                      key={type}
                      label={OPTION_LABELS[type]}
                      checked={form.excluded_employment_types.includes(type)}
                      onChange={() =>
                        set(
                          "excluded_employment_types",
                          toggleValue(form.excluded_employment_types, type),
                        )
                      }
                    />
                  ))}
                </CheckboxRow>
              </FieldGroup>

              <FieldGroup
                legend="Working time"
                hint={
                  <p>
                    Full-time (Vollzeit), part-time (Teilzeit), Minijob (marginal employment). A
                    posting offering none of the ticked ones is at most Fair chance. Tick none to
                    accept any.
                  </p>
                }
              >
                <CheckboxRow>
                  {WORK_TIME_MODELS.map((type) => (
                    <Checkbox
                      key={type}
                      label={OPTION_LABELS[type]}
                      checked={form.work_time_models.includes(type)}
                      onChange={() =>
                        set("work_time_models", toggleValue(form.work_time_models, type))
                      }
                    />
                  ))}
                </CheckboxRow>
              </FieldGroup>
            </div>
          </SettingsSection>
        </div>
      )}

      {!loading && (
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          label="Save preferences"
          error={error}
          savedMessage={message}
        />
      )}
    </main>
  );
}
