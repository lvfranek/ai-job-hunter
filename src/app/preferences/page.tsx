"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleNotch, Info, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { ChancePill } from "@/components/ChanceBadge";
import { ChipInput } from "@/components/ChipInput";
import { buttonSecondary, Switch, ToggleChip } from "@/components/controls";
import {
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
import { InfoTip } from "@/components/InfoTip";
import { WorkLocationsField, type LocationRow } from "@/components/WorkLocationsField";
import type { Chance } from "@/lib/chance";
import {
  DEFAULT_LEVEL,
  DEFAULT_PREFERENCES,
  LEVELS,
  toChips,
  WORK_TIME_MODELS,
} from "@/lib/preferences";
import { useDirtyGuard } from "@/lib/unsaved-changes";

/** The page's working copy: chips as lists, years and radii as text so a field can be cleared. */
interface PreferencesForm {
  own_skills: string[];
  basic_skills: string[];
  spoken_languages: string;
  experience_years: string;
  level: string;
  dealbreakers: string;
  remote_ok: boolean;
  office_ok: boolean;
  work_locations: LocationRow[];
  excluded_employment_types: string[];
  work_time_models: string[];
}

const DEFAULTS: PreferencesForm = {
  ...DEFAULT_PREFERENCES,
  own_skills: [],
  basic_skills: [],
  experience_years: "",
  work_locations: [],
};

const LEVEL_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
};

// The best rating a job of each level can still get at your level — the rules
// in scoring-rules.ts, in the dashboard's own tiers.
const LEVEL_EFFECTS: Record<string, [string, Chance][]> = {
  junior: [
    ["Junior jobs", "very_good"],
    ["Mid-level jobs", "fair"],
    ["Senior jobs", "low"],
  ],
  mid: [
    ["Junior jobs", "very_good"],
    ["Mid-level jobs", "very_good"],
    ["Senior jobs", "low"],
  ],
  senior: [
    ["Junior jobs", "very_good"],
    ["Mid-level jobs", "very_good"],
    ["Senior jobs", "very_good"],
  ],
};

// Shown as what you accept; stored as what you exclude (excluded_employment_types).
const CONTRACT_OPTIONS: [string, string][] = [
  ["freelance", "Freelance"],
  ["werkstudent", "Working student"],
  ["praktikum", "Internship"],
  ["ausbildung", "Apprenticeship"],
  ["studium", "Dual study"],
];

const WORK_TIME_LABELS: Record<string, string> = {
  vollzeit: "Full-time",
  teilzeit: "Part-time",
  minijob: "Minijob",
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
    own_skills: toChips(text(data.own_skills)),
    basic_skills: toChips(text(data.basic_skills)),
    spoken_languages: text(data.spoken_languages),
    experience_years: yearsText(data.experience_years),
    level: LEVELS.includes(text(data.level)) ? text(data.level) : DEFAULT_LEVEL,
    dealbreakers: text(data.dealbreakers),
    remote_ok: data.remote_ok !== false,
    office_ok: data.office_ok !== false,
    work_locations: locationRows(data.work_locations),
    excluded_employment_types: list(data.excluded_employment_types),
    // A new profile accepts every working time.
    work_time_models:
      data.work_time_models === undefined ? [...WORK_TIME_MODELS] : list(data.work_time_models),
  };
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** Chips added to a list, skipping ones it already has (case-blind). */
function mergeChips(current: string[], added: string[]): string[] {
  return toChips([...current, ...added].join(","));
}

function isYears(value: string): boolean {
  if (!value.trim()) return true;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0;
}

/** What each tier means, behind a button so the page starts with the settings. */
function HowRatingsWork() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const tiers: [Chance, string][] = [
    ["very_good", "You meet every must-have and nothing holds it back."],
    ["good", "Most must-haves met, or one small gap, like a year less experience."],
    ["fair", "Clear gaps, but still possible."],
    [
      "low",
      "A hard blocker: too far away, a dealbreaker, a contract form or working time you don't accept, a language you don't speak well enough. Or most must-haves missing.",
    ],
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="how-ratings-work"
        className={buttonSecondary}
      >
        <Info size={16} />
        How ratings work
      </button>
      {open && (
        <div
          id="how-ratings-work"
          role="dialog"
          aria-label="How ratings work"
          className="absolute top-full right-0 z-40 mt-2 w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-[#D7E4ED] bg-white p-4 shadow-[0_20px_44px_-16px_rgba(30,64,120,0.45)]"
        >
          <h2 className="mb-3 text-[13px] font-semibold text-[#1E2A3D]">How each job is rated</h2>
          <ul className="space-y-2.5">
            {tiers.map(([chance, meaning]) => (
              <li
                key={chance}
                className="grid grid-cols-[8.5rem_1fr] items-start gap-2 text-[12.5px] leading-relaxed text-[#1E2A3D]"
              >
                <span>
                  <ChancePill chance={chance} />
                </span>
                <span>{meaning}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3.5 border-t border-[#D7E4ED] pt-3 text-[12px] text-text-muted">
            Saving this page marks every rating as outdated. Rescore from the dashboard whenever you
            like.
          </p>
        </div>
      )}
    </div>
  );
}

/** Reads a CV once and suggests chips; neither the file nor its text is kept. */
function FillFromCv({
  onSkills,
  onError,
}: {
  onSkills: (skills: { strong: string[]; basics: string[]; languages: string }) => number;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "done">("idle");
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(t);
  }, [state]);

  async function read(file: File) {
    setState("reading");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/preferences/cv", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't read the CV");
      setAdded(
        onSkills({
          strong: list(data?.strong),
          basics: list(data?.basics),
          languages: text(data?.languages),
        }),
      );
      setState("done");
    } catch (e) {
      setState("idle");
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === "reading"}
        className={buttonSecondary}
      >
        {state === "reading" ? (
          <CircleNotch size={16} className="animate-spin" />
        ) : state === "done" ? (
          <Check size={16} weight="bold" />
        ) : (
          <UploadSimple size={16} />
        )}
        {state === "reading"
          ? "Reading CV…"
          : state === "done"
            ? `Added ${added} from your CV`
            : "Fill in from a CV"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) read(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

export default function PreferencesPage() {
  const [form, setForm] = useState<PreferencesForm>(DEFAULTS);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDirtyGuard(!loading && JSON.stringify(form) !== savedSnapshot);

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        const next = toForm(data && typeof data === "object" ? data : {});
        setForm(next);
        setSavedSnapshot(JSON.stringify(next));
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

  /** Merges chips suggested from a CV; returns how many were new. */
  function addFromCv(skills: { strong: string[]; basics: string[]; languages: string }): number {
    const strong = mergeChips(form.own_skills, skills.strong);
    // Something already listed as strong never comes back as a basic.
    const known = new Set(strong.map((s) => s.toLowerCase()));
    const basics = mergeChips(
      form.basic_skills,
      skills.basics.filter((b) => !known.has(b.toLowerCase())),
    );
    setForm((f) => ({
      ...f,
      own_skills: strong,
      basic_skills: basics,
      spoken_languages: f.spoken_languages.trim() ? f.spoken_languages : skills.languages,
    }));
    return strong.length - form.own_skills.length + (basics.length - form.basic_skills.length);
  }

  async function handleSave() {
    setError(null);
    if (form.own_skills.length === 0)
      return setError("Add at least one strong skill — the AI needs something to compare with");
    if (!form.experience_years.trim())
      return setError("Add your years of work experience (0 is fine)");
    if (!isYears(form.experience_years)) return setError("Years must be a number, e.g. 1 or 1.5");
    if (!form.remote_ok && !form.office_ok)
      return setError("Turn on remote jobs, office jobs or both — otherwise every job is Low");
    if (form.work_time_models.length === 0) return setError("Pick at least one working time");

    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          experience_years: form.experience_years.replace(",", "."),
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
      <PageHeader title="AI Scoring Preferences" action={<HowRatingsWork />} />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="space-y-4">
          <SettingsSection
            title="What you bring"
            info="The only place the AI learns what you can do. A job's requirements count as met only if they're here: tools, experience, degrees, licences. The job title doesn't matter."
            action={<FillFromCv onSkills={addFromCv} onError={setError} />}
          >
            <Field
              label="Strong"
              htmlFor="prefs-strong"
              info="What you've used at work, in training or in real projects. Counts as met when a job asks for it."
            >
              <ChipInput
                id="prefs-strong"
                values={form.own_skills}
                onChange={(values) => set("own_skills", values)}
                placeholder="Add a tool, a degree, an experience… then press Enter"
              />
            </Field>

            <Field
              label="Basics"
              htmlFor="prefs-basics"
              info="Courses, hobby projects, things you've touched but not used at work. Counts as partly met."
            >
              <ChipInput
                id="prefs-basics"
                values={form.basic_skills}
                onChange={(values) => set("basic_skills", values)}
                placeholder="Add a skill… then press Enter"
                soft
              />
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Years of work experience"
                htmlFor="prefs-experience-years"
                info="Professional experience in total; a working-student job counts. One year short of what a job asks caps it at Good, two at Fair, three or more makes it Low."
              >
                <div className="flex items-center gap-2">
                  <input
                    id="prefs-experience-years"
                    inputMode="decimal"
                    value={form.experience_years}
                    onChange={(e) => set("experience_years", e.target.value)}
                    placeholder="e.g. 2"
                    className={`${textInputClass} max-w-20 text-right tabular-nums`}
                  />
                  <span className="text-[13px] text-text-muted">years</span>
                </div>
              </Field>

              <Field
                label="Languages"
                htmlFor="prefs-spoken-languages"
                info="A language level a job requires and you don't have makes it Low."
              >
                <input
                  id="prefs-spoken-languages"
                  value={form.spoken_languages}
                  onChange={(e) => set("spoken_languages", e.target.value)}
                  placeholder="e.g. German native, English C1"
                  className={textInputClass}
                />
              </Field>
            </div>

            <FieldGroup
              legend="Your level"
              info="The level of job you're ready for. Jobs at or below it aren't held back; jobs above it are rated lower, as shown below."
            >
              <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-[#E9F2F8] p-[3px]">
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={form.level === level}
                    onClick={() => set("level", level)}
                    className={`h-7.5 rounded-[9px] px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#101828]/30 ${
                      form.level === level
                        ? "bg-white font-medium text-[#101828] shadow-[0_1px_3px_rgba(30,64,120,0.18)]"
                        : "text-text-muted hover:text-[#101828]"
                    }`}
                  >
                    {LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12.5px]">
                <span className="w-full font-medium text-[#1E2A3D]">Best possible rating:</span>
                {(LEVEL_EFFECTS[form.level] ?? LEVEL_EFFECTS[DEFAULT_LEVEL]).map(
                  ([jobs, chance]) => (
                    <span key={jobs} className="inline-flex items-center gap-1.5">
                      <span className="text-text-muted">{jobs}</span>
                      <ChancePill chance={chance} />
                    </span>
                  ),
                )}
              </div>
            </FieldGroup>
          </SettingsSection>

          <SettingsSection
            title="What you don't want"
            info="A posting that clearly matches one of these is rated Low, with the reason shown. Also the place for work you could do but don't want, e.g. pure backend jobs."
          >
            <textarea
              id="prefs-dealbreakers"
              aria-label="What you don't want"
              value={form.dealbreakers}
              onChange={(e) => set("dealbreakers", e.target.value)}
              rows={3}
              placeholder="e.g. No cold calling or sales targets, no shift work, nothing in gambling."
              className={textareaClass}
            />
          </SettingsSection>

          <SettingsSection title="Location">
            <Switch checked={form.remote_ok} onChange={(on) => set("remote_ok", on)}>
              Fully remote jobs are fine
              <InfoTip label="About remote jobs">
                Remote jobs count wherever the company is based. Off: they&apos;re rated Low.
              </InfoTip>
            </Switch>
            <Switch checked={form.office_ok} onChange={(on) => set("office_ok", on)}>
              Office jobs (hybrid / on-site) are fine
              <InfoTip label="About office jobs">
                Jobs with office days. Off: they&apos;re rated Low, so only remote jobs count.
              </InfoTip>
            </Switch>

            {form.office_ok && (
              <FieldGroup
                legend="Cities you'd commute to"
                info="For hybrid and on-site jobs: anywhere in the city plus this distance around it, as the crow flies. Further away is rated Low. Add none to accept any place."
              >
                <WorkLocationsField
                  rows={form.work_locations}
                  onChange={(rows) => set("work_locations", rows)}
                />
              </FieldGroup>
            )}
          </SettingsSection>

          <SettingsSection title="Contract & working time">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FieldGroup
                legend="Contract forms you accept"
                info="Postings for any other contract form are rated Low."
              >
                <div className="flex flex-wrap gap-2">
                  <ToggleChip pressed disabled onChange={() => {}}>
                    Regular job
                  </ToggleChip>
                  {CONTRACT_OPTIONS.map(([value, label]) => (
                    <ToggleChip
                      key={value}
                      pressed={!form.excluded_employment_types.includes(value)}
                      onChange={() =>
                        set(
                          "excluded_employment_types",
                          toggleValue(form.excluded_employment_types, value),
                        )
                      }
                    >
                      {label}
                    </ToggleChip>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup
                legend="Working time you accept"
                info="A job offering none of these is rated Low."
              >
                <div className="flex flex-wrap gap-2">
                  {WORK_TIME_MODELS.map((value) => (
                    <ToggleChip
                      key={value}
                      pressed={form.work_time_models.includes(value)}
                      onChange={() =>
                        set("work_time_models", toggleValue(form.work_time_models, value))
                      }
                    >
                      {WORK_TIME_LABELS[value]}
                    </ToggleChip>
                  ))}
                </div>
              </FieldGroup>
            </div>
          </SettingsSection>

          <p className="px-2 text-[11.5px] text-text-faint">
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
          </p>
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
