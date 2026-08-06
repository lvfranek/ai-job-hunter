"use client";

import { useEffect, useState } from "react";
import { Target } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";
import { Checkbox } from "@/components/Checkbox";
import { SeniorityScale } from "@/components/SeniorityScale";
import { Toast } from "@/components/Toast";
import { useDirtyGuard } from "@/lib/unsaved-changes";

interface PreferencesForm {
  target_titles: string[];
  preferred_seniority: number;
  preferred_location: string;
  job_type: string[];
  company_size: string[];
  excluded_keywords: string[];
}

const JOB_TYPES = ["remote", "hybrid", "on-site"];
const COMPANY_SIZES = ["startup", "scale-up", "enterprise"];

const DEFAULTS: PreferencesForm = {
  target_titles: [],
  preferred_seniority: 5,
  preferred_location: "",
  job_type: [],
  company_size: [],
  excluded_keywords: [],
};

function toForm(data: Record<string, unknown>): PreferencesForm {
  return {
    target_titles: (data.target_titles as string[]) ?? DEFAULTS.target_titles,
    preferred_seniority:
      data.preferred_seniority != null
        ? Number(data.preferred_seniority)
        : DEFAULTS.preferred_seniority,
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
        Preferences
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Preferences</h1>
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

          <TagInput
            label="Target job titles"
            helperText="AI will score jobs matching these titles"
            tags={form.target_titles}
            onChange={(target_titles) => setForm({ ...form, target_titles })}
          />

          <SeniorityScale
            value={form.preferred_seniority}
            onChange={(preferred_seniority) => setForm({ ...form, preferred_seniority })}
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
