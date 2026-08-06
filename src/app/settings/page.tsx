"use client";

import { useEffect, useState } from "react";
import { GearSix } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";

interface PortalToggles {
  indeed: boolean;
  linkedin: boolean;
  xing: boolean;
  stepstone: boolean;
  arbeitsagentur: boolean;
}

interface SettingsForm {
  target_titles: string[];
  target_skills: string[];
  job_level: string;
  max_posting_age_days: number;
  results_per_scan: number;
  portal_toggles: PortalToggles;
}

const JOB_LEVELS = ["junior", "mid", "senior", "lead", "principal"];

const PORTALS: { key: keyof PortalToggles; label: string }[] = [
  { key: "indeed", label: "Indeed" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "xing", label: "Xing" },
  { key: "stepstone", label: "Stepstone" },
  { key: "arbeitsagentur", label: "Arbeitsagentur" },
];

const DEFAULTS: SettingsForm = {
  target_titles: [],
  target_skills: [],
  job_level: "senior",
  max_posting_age_days: 30,
  results_per_scan: 100,
  portal_toggles: {
    indeed: true,
    linkedin: true,
    xing: true,
    stepstone: true,
    arbeitsagentur: true,
  },
};

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setForm({
          target_titles: data.target_titles ?? DEFAULTS.target_titles,
          target_skills: data.target_skills ?? DEFAULTS.target_skills,
          job_level: data.job_level ?? DEFAULTS.job_level,
          max_posting_age_days: data.max_posting_age_days ?? DEFAULTS.max_posting_age_days,
          results_per_scan: data.results_per_scan ?? DEFAULTS.results_per_scan,
          portal_toggles: { ...DEFAULTS.portal_toggles, ...data.portal_toggles },
        });
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
    if (form.target_skills.length === 0) return setError("Add at least one target skill");
    if (form.max_posting_age_days <= 0) return setError("Max posting age must be greater than 0");
    if (form.results_per_scan <= 0) return setError("Results per scan must be greater than 0");

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setMessage("Settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="px-8 py-8">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-text-faint">
        <GearSix size={15} />
        Settings
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Settings</h1>
        {message && (
          <span className="rounded-lg border border-score-high/30 bg-score-high/15 px-3 py-1.5 text-[13px] text-score-high">
            {message}
          </span>
        )}
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
          <TagInput
            label="What job titles are you interested in?"
            helperText="Add titles from your profile or new ones you're targeting"
            tags={form.target_titles}
            onChange={(target_titles) => setForm({ ...form, target_titles })}
          />

          <TagInput
            label="Which skills should we match against?"
            helperText="Pre-filled from your CV. Adjust to match your preferences"
            tags={form.target_skills}
            onChange={(target_skills) => setForm({ ...form, target_skills })}
          />

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              What seniority level are you targeting?
            </label>
            <select
              value={form.job_level}
              onChange={(e) => setForm({ ...form, job_level: e.target.value })}
              className="w-full max-w-xs rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
            >
              {JOB_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              Which job boards should we search?
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border-strong bg-surface px-3.5 py-3">
              {PORTALS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-[13px] text-text">
                  <input
                    type="checkbox"
                    checked={form.portal_toggles[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        portal_toggles: { ...form.portal_toggles, [key]: e.target.checked },
                      })
                    }
                    className="size-4 accent-text"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Max posting age (days)
              </label>
              <input
                type="number"
                min={1}
                value={form.max_posting_age_days}
                onChange={(e) =>
                  setForm({ ...form, max_posting_age_days: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Results per scan
              </label>
              <input
                type="number"
                min={1}
                value={form.results_per_scan}
                onChange={(e) => setForm({ ...form, results_per_scan: Number(e.target.value) })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl border border-border-strong bg-surface px-4 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}
    </main>
  );
}
