"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/Checkbox";
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
import { useDirtyGuard } from "@/lib/unsaved-changes";

interface PreferencesForm {
  notes: string;
  own_skills: string;
  preferred_languages: string;
  soft_skills_flexible: boolean;
  preferred_location: string;
  job_type: string[];
  excluded_employment_types: string[];
  work_time_models: string[];
}

const JOB_TYPES = ["remote", "hybrid", "on-site"];

// German labour-market contract forms. Kept in German because that is exactly
// how they appear in the postings — "Werkstudent" and "Minijob" have no useful
// English equivalent to match against.
//
// Note the inverted meaning: ticking one EXCLUDES it. German boards are full of
// Werkstudent/Ausbildung postings, so "filter these out" is the useful control.
const EXCLUDED_EMPLOYMENT_TYPES = ["freelance", "ausbildung", "studium", "werkstudent"];
const WORK_TIME_MODELS = ["vollzeit", "teilzeit", "minijob"];

const DEFAULTS: PreferencesForm = {
  notes: "",
  own_skills: "",
  preferred_languages: "",
  soft_skills_flexible: false,
  preferred_location: "",
  job_type: [],
  excluded_employment_types: [],
  work_time_models: [],
};

function toForm(data: Record<string, unknown>): PreferencesForm {
  return {
    notes: (data.notes as string) ?? DEFAULTS.notes,
    own_skills: (data.own_skills as string) ?? DEFAULTS.own_skills,
    preferred_languages: (data.preferred_languages as string) ?? DEFAULTS.preferred_languages,
    soft_skills_flexible: (data.soft_skills_flexible as boolean) ?? DEFAULTS.soft_skills_flexible,
    preferred_location: (data.preferred_location as string) ?? DEFAULTS.preferred_location,
    job_type: (data.job_type as string[]) ?? DEFAULTS.job_type,
    excluded_employment_types:
      (data.excluded_employment_types as string[]) ?? DEFAULTS.excluded_employment_types,
    work_time_models: (data.work_time_models as string[]) ?? DEFAULTS.work_time_models,
  };
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
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
        const next = toForm(data);
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

  async function handleSave() {
    setError(null);
    if (!form.notes.trim()) return setError("Describe what you're looking for");

    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      const data = await res.json().catch(() => null);
      setSavedSnapshot(JSON.stringify(form));
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
        description="Changing these preferences marks all job scores as outdated. Rescore anytime from the dashboard."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="space-y-4">
          <SettingsSection
            title="Your ideal job"
            description={
              <p>
                The AI reads this directly — titles, seniority, skills, and anything you want to
                avoid, all in your own words.
              </p>
            }
          >
            <Field label="What are you looking for?" htmlFor="prefs-notes">
              <textarea
                id="prefs-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={8}
                placeholder={
                  "e.g. Junior-to-mid frontend developer, strong in React and TypeScript, " +
                  "comfortable with Node.js on the backend. Open to Vue or Svelte roles too. " +
                  "Not interested in Django/PHP-heavy roles or anything in gaming."
                }
                className={textareaClass}
              />
            </Field>
          </SettingsSection>

          <SettingsSection
            title="Skills"
            description={<p>How your abilities are matched against each posting.</p>}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Concrete skills you have"
                htmlFor="prefs-own-skills"
                hint={
                  <p>
                    What you can actually do today, comma-separated. The AI matches job requirements
                    against this — and counts adjacent tech (React ↔ Vue, Node ↔ Python) as
                    transferable rather than missing.
                  </p>
                }
              >
                <input
                  id="prefs-own-skills"
                  value={form.own_skills}
                  onChange={(e) => setForm({ ...form, own_skills: e.target.value })}
                  placeholder="React, TypeScript, Git, SQL, Figma"
                  className={textInputClass}
                />
              </Field>

              <Field
                label="Preferred programming languages"
                htmlFor="prefs-preferred-languages"
                hint={
                  <p>
                    What you would rather work in day to day. A job in another language isn&apos;t
                    excluded — it just scores a little lower.
                  </p>
                }
              >
                <input
                  id="prefs-preferred-languages"
                  value={form.preferred_languages}
                  onChange={(e) => setForm({ ...form, preferred_languages: e.target.value })}
                  placeholder="TypeScript, Python, Go"
                  className={textInputClass}
                />
              </Field>
            </div>

            <div>
              <Checkbox
                label="Soft skills flexible"
                checked={form.soft_skills_flexible}
                onChange={() =>
                  setForm({ ...form, soft_skills_flexible: !form.soft_skills_flexible })
                }
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">
                Treats every soft-skill requirement in a posting (Zuverlässigkeit, Teamfähigkeit,
                Belastbarkeit, Kommunikationsstärke …) as fully met, so the AI never deducts points
                for one.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Location & job type"
            description={<p>Where and how you want to work.</p>}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Preferred location"
                htmlFor="prefs-preferred-location"
                hint={<p>Where you want to work (can differ from where you live)</p>}
              >
                <input
                  id="prefs-preferred-location"
                  value={form.preferred_location}
                  onChange={(e) => setForm({ ...form, preferred_location: e.target.value })}
                  placeholder="Berlin, Germany"
                  className={textInputClass}
                />
              </Field>

              <FieldGroup legend="Job type">
                <CheckboxRow>
                  {JOB_TYPES.map((type) => (
                    <Checkbox
                      key={type}
                      label={type}
                      checked={form.job_type.includes(type)}
                      onChange={() =>
                        setForm({ ...form, job_type: toggleValue(form.job_type, type) })
                      }
                    />
                  ))}
                </CheckboxRow>
              </FieldGroup>
            </div>
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
                    Tick what you do <strong>not</strong> want — Ausbildung (apprenticeship),
                    Studium (dual study), Werkstudent (working student), Freelance. A ticked form is
                    treated as a hard blocker: those postings score low and say why. Tick nothing to
                    accept every contract form.
                  </p>
                }
              >
                <CheckboxRow>
                  {EXCLUDED_EMPLOYMENT_TYPES.map((type) => (
                    <Checkbox
                      key={type}
                      label={type}
                      checked={form.excluded_employment_types.includes(type)}
                      onChange={() =>
                        setForm({
                          ...form,
                          excluded_employment_types: toggleValue(
                            form.excluded_employment_types,
                            type,
                          ),
                        })
                      }
                    />
                  ))}
                </CheckboxRow>
              </FieldGroup>

              <FieldGroup
                legend="Working time"
                hint={
                  <p>
                    Vollzeit (full-time), Teilzeit (part-time), Minijob (marginal employment). Tick
                    none to accept any.
                  </p>
                }
              >
                <CheckboxRow>
                  {WORK_TIME_MODELS.map((type) => (
                    <Checkbox
                      key={type}
                      label={type}
                      checked={form.work_time_models.includes(type)}
                      onChange={() =>
                        setForm({
                          ...form,
                          work_time_models: toggleValue(form.work_time_models, type),
                        })
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
