"use client";

import { useEffect, useState } from "react";
import { Target } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";
import { Checkbox } from "@/components/Checkbox";
import { Scale } from "@/components/Scale";
import { Toast } from "@/components/Toast";
import { useDirtyGuard } from "@/lib/unsaved-changes";

interface PreferencesForm {
  target_titles: string[];
  title_strictness: number;
  target_skills_frontend: string[];
  skills_frontend_strictness: number;
  target_skills_backend: string[];
  skills_backend_strictness: number;
  target_skills_tools: string[];
  skills_tools_strictness: number;
  target_skills_other: string[];
  skills_other_strictness: number;
  preferred_seniority: number;
  preferred_location: string;
  job_type: string[];
  company_size: string[];
  excluded_keywords: string[];
}

const JOB_TYPES = ["remote", "hybrid", "on-site"];
const COMPANY_SIZES = ["startup", "scale-up", "enterprise"];

const SENIORITY_LABELS: [number, string][] = [
  [0, "Entry level"],
  [3, "Junior"],
  [5, "Mid-level"],
  [7, "Senior"],
  [9, "Lead / Principal"],
];

const STRICTNESS_LABELS: [number, string][] = [
  [0, "Very strict"],
  [3, "Mostly strict"],
  [5, "Balanced"],
  [7, "Loose"],
  [9, "Very loose"],
];

// One strictness slider per fuzzy-matched skill category — how leniently the AI
// credits skills that aren't an exact match (e.g. Vue counting toward React).
const SKILL_CATEGORIES: {
  key: "target_skills_frontend" | "target_skills_backend" | "target_skills_tools" | "target_skills_other";
  strictnessKey:
    | "skills_frontend_strictness"
    | "skills_backend_strictness"
    | "skills_tools_strictness"
    | "skills_other_strictness";
  label: string;
}[] = [
  { key: "target_skills_frontend", strictnessKey: "skills_frontend_strictness", label: "Frontend" },
  { key: "target_skills_backend", strictnessKey: "skills_backend_strictness", label: "Backend" },
  { key: "target_skills_tools", strictnessKey: "skills_tools_strictness", label: "Tools" },
  { key: "target_skills_other", strictnessKey: "skills_other_strictness", label: "Other" },
];

function labelFor(labels: [number, string][], value: number): string {
  let label = labels[0][1];
  for (const [threshold, text] of labels) {
    if (value >= threshold) label = text;
  }
  return label;
}

const DEFAULTS: PreferencesForm = {
  target_titles: [],
  title_strictness: 5,
  target_skills_frontend: [],
  skills_frontend_strictness: 5,
  target_skills_backend: [],
  skills_backend_strictness: 5,
  target_skills_tools: [],
  skills_tools_strictness: 5,
  target_skills_other: [],
  skills_other_strictness: 5,
  preferred_seniority: 5,
  preferred_location: "",
  job_type: [],
  company_size: [],
  excluded_keywords: [],
};

function toForm(data: Record<string, unknown>): PreferencesForm {
  const num = (value: unknown, fallback: number) => (value != null ? Number(value) : fallback);
  return {
    target_titles: (data.target_titles as string[]) ?? DEFAULTS.target_titles,
    title_strictness: num(data.title_strictness, DEFAULTS.title_strictness),
    target_skills_frontend:
      (data.target_skills_frontend as string[]) ?? DEFAULTS.target_skills_frontend,
    skills_frontend_strictness: num(
      data.skills_frontend_strictness,
      DEFAULTS.skills_frontend_strictness
    ),
    target_skills_backend:
      (data.target_skills_backend as string[]) ?? DEFAULTS.target_skills_backend,
    skills_backend_strictness: num(
      data.skills_backend_strictness,
      DEFAULTS.skills_backend_strictness
    ),
    target_skills_tools: (data.target_skills_tools as string[]) ?? DEFAULTS.target_skills_tools,
    skills_tools_strictness: num(data.skills_tools_strictness, DEFAULTS.skills_tools_strictness),
    target_skills_other: (data.target_skills_other as string[]) ?? DEFAULTS.target_skills_other,
    skills_other_strictness: num(data.skills_other_strictness, DEFAULTS.skills_other_strictness),
    preferred_seniority: num(data.preferred_seniority, DEFAULTS.preferred_seniority),
    preferred_location: (data.preferred_location as string) ?? DEFAULTS.preferred_location,
    job_type: (data.job_type as string[]) ?? DEFAULTS.job_type,
    company_size: (data.company_size as string[]) ?? DEFAULTS.company_size,
    excluded_keywords: (data.excluded_keywords as string[]) ?? DEFAULTS.excluded_keywords,
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
    if (form.target_titles.length === 0) return setError("Add at least one target job title");

    setSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      setSavedSnapshot(JSON.stringify(form));
      setMessage("Preferences saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="px-8 py-8">
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
        <div className="mb-4 rounded-lg border border-score-low/30 bg-score-low/15 px-3.5 py-2.5 text-[13px] text-score-low">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="max-w-2xl space-y-6">
          <p className="rounded-lg border border-score-mid/30 bg-score-mid/15 px-3.5 py-2.5 text-[12px] text-score-mid">
            Changing these preferences marks all job scores as outdated. Rescore anytime from the
            dashboard.
          </p>

          <div className="space-y-3">
            <TagInput
              label="Target job titles"
              helperText="AI will score jobs matching these titles"
              tags={form.target_titles}
              onChange={(target_titles) => setForm({ ...form, target_titles })}
            />
            <Scale
              label="Title matching strictness"
              value={form.title_strictness}
              onChange={(title_strictness) => setForm({ ...form, title_strictness })}
              labelFor={(v) => labelFor(STRICTNESS_LABELS, v)}
              leftHint="Strict"
              rightHint="Loose"
            />
          </div>

          <div>
            <h2 className="mb-3 text-[15px] font-semibold text-text">Skills</h2>
            <p className="mb-4 text-[12px] text-text-faint">
              What the AI scores jobs against for skill fit, sorted by category
              (independent of your CV in Cover Letter Profile). Each category has its own
              strictness — e.g. very strict on frontend skills but loose on tools.
            </p>
            <div className="space-y-6">
              {SKILL_CATEGORIES.map(({ key, strictnessKey, label }) => (
                <div key={key} className="space-y-3">
                  <TagInput
                    label={`${label} skills`}
                    tags={form[key]}
                    onChange={(tags) => setForm({ ...form, [key]: tags })}
                  />
                  <Scale
                    label={`${label} strictness`}
                    value={form[strictnessKey]}
                    onChange={(v) => setForm({ ...form, [strictnessKey]: v })}
                    labelFor={(v) => labelFor(STRICTNESS_LABELS, v)}
                    leftHint="Strict"
                    rightHint="Loose"
                  />
                </div>
              ))}
            </div>
          </div>

          <Scale
            label="Preferred seniority"
            value={form.preferred_seniority}
            onChange={(preferred_seniority) => setForm({ ...form, preferred_seniority })}
            labelFor={(v) => labelFor(SENIORITY_LABELS, v)}
            leftHint="Entry level"
            rightHint="Lead / Principal"
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Preferred location
            </label>
            <input
              value={form.preferred_location}
              onChange={(e) => setForm({ ...form, preferred_location: e.target.value })}
              placeholder="Berlin, Germany"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
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
              Company size
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border-strong bg-surface px-3.5 py-3">
              {COMPANY_SIZES.map((size) => (
                <Checkbox
                  key={size}
                  label={size}
                  checked={form.company_size.includes(size)}
                  onChange={() =>
                    setForm({ ...form, company_size: toggleValue(form.company_size, size) })
                  }
                />
              ))}
            </div>
          </div>

          <TagInput
            label="Things to avoid"
            helperText="Technologies, industries, or employer types you don't want (e.g. Django, federal agency)"
            tags={form.excluded_keywords}
            onChange={(excluded_keywords) => setForm({ ...form, excluded_keywords })}
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl border border-border-strong bg-surface px-4 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Preferences"}
          </button>
        </div>
      )}
    </main>
  );
}
