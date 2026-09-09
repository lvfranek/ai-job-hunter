"use client";

import { useEffect, useState } from "react";
import { Target } from "@phosphor-icons/react/dist/ssr";
import { Checkbox } from "@/components/Checkbox";
import { Toast } from "@/components/Toast";
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
    preferred_languages:
      (data.preferred_languages as string) ?? DEFAULTS.preferred_languages,
    soft_skills_flexible:
      (data.soft_skills_flexible as boolean) ?? DEFAULTS.soft_skills_flexible,
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
      setMessage(data?.demo ? "Demo mode — changes aren't saved" : "Preferences saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="py-8 pr-8">
      <Toast message={message} />
      <div className="mb-4 flex items-center gap-2 text-[13px] text-text-faint">
        <Target size={15} />
        AI Scoring Preferences
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          AI Scoring Preferences
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-100 px-3.5 py-2.5 text-[13px] text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="max-w-2xl space-y-6">
          <p className="rounded-lg border border-amber-300 bg-amber-100 px-3.5 py-2.5 text-[12px] text-amber-800">
            Changing these preferences marks all job scores as outdated. Rescore anytime from the
            dashboard.
          </p>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              What are you looking for?
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={8}
              placeholder={
                "e.g. Junior-to-mid frontend developer, strong in React and TypeScript, " +
                "comfortable with Node.js on the backend. Open to Vue or Svelte roles too. " +
                "Not interested in Django/PHP-heavy roles or anything in gaming."
              }
              className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-text outline-none focus:border-[#101828]"
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              The AI reads this directly — titles, seniority, skills, and anything you want to
              avoid, all in your own words.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Concrete skills you have
            </label>
            <input
              value={form.own_skills}
              onChange={(e) => setForm({ ...form, own_skills: e.target.value })}
              placeholder="React, TypeScript, Git, SQL, Figma"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-[#101828]"
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              What you can actually do today, comma-separated. The AI matches job requirements
              against this — and counts adjacent tech (React ↔ Vue, Node ↔ Python) as
              transferable rather than missing.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Preferred programming languages
            </label>
            <input
              value={form.preferred_languages}
              onChange={(e) => setForm({ ...form, preferred_languages: e.target.value })}
              placeholder="TypeScript, Python, Go"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-[#101828]"
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              What you would rather work in day to day. A job in another language isn&apos;t
              excluded — it just scores a little lower.
            </p>
          </div>

          <div className="rounded-lg border border-border-strong bg-surface px-3.5 py-3">
            <Checkbox
              label="Soft skills flexible"
              checked={form.soft_skills_flexible}
              onChange={() =>
                setForm({ ...form, soft_skills_flexible: !form.soft_skills_flexible })
              }
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              Treats every soft-skill requirement in a posting (Zuverlässigkeit, Teamfähigkeit,
              Belastbarkeit, Kommunikationsstärke …) as fully met, so the AI never deducts
              points for one.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Preferred location
            </label>
            <input
              value={form.preferred_location}
              onChange={(e) => setForm({ ...form, preferred_location: e.target.value })}
              placeholder="Berlin, Germany"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-[#101828]"
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              Where you want to work (can differ from where you live)
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Job type
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border-strong bg-surface px-3.5 py-3">
              {JOB_TYPES.map((type) => (
                <Checkbox
                  key={type}
                  label={type}
                  checked={form.job_type.includes(type)}
                  onChange={() => setForm({ ...form, job_type: toggleValue(form.job_type, type) })}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Exclude contract forms
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border-strong bg-surface px-3.5 py-3">
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
                        type
                      ),
                    })
                  }
                />
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-text-faint">
              Tick what you do <strong>not</strong> want — Ausbildung (apprenticeship), Studium
              (dual study), Werkstudent (working student), Freelance. A ticked form is treated
              as a hard blocker: those postings score low and say why. Tick nothing to accept
              every contract form.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Working time
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border-strong bg-surface px-3.5 py-3">
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
            </div>
            <p className="mt-1.5 text-[12px] text-text-faint">
              Vollzeit (full-time), Teilzeit (part-time), Minijob (marginal employment). Tick
              none to accept any.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-[#101828] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      )}
    </main>
  );
}
