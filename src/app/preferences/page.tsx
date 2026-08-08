"use client";

import { useEffect, useState } from "react";
import { Target } from "@phosphor-icons/react/dist/ssr";
import { Checkbox } from "@/components/Checkbox";
import { Scale } from "@/components/Scale";
import { Toast } from "@/components/Toast";
import { useDirtyGuard } from "@/lib/unsaved-changes";

interface PreferencesForm {
  notes: string;
  preferred_seniority: number;
  preferred_location: string;
  job_type: string[];
}

const JOB_TYPES = ["remote", "hybrid", "on-site"];

const SENIORITY_LABELS: [number, string][] = [
  [0, "Entry level"],
  [3, "Junior"],
  [5, "Mid-level"],
  [7, "Senior"],
  [9, "Lead / Principal"],
];

function labelFor(labels: [number, string][], value: number): string {
  let label = labels[0][1];
  for (const [threshold, text] of labels) {
    if (value >= threshold) label = text;
  }
  return label;
}

const DEFAULTS: PreferencesForm = {
  notes: "",
  preferred_seniority: 5,
  preferred_location: "",
  job_type: [],
};

function toForm(data: Record<string, unknown>): PreferencesForm {
  return {
    notes: (data.notes as string) ?? DEFAULTS.notes,
    preferred_seniority:
      data.preferred_seniority != null
        ? Number(data.preferred_seniority)
        : DEFAULTS.preferred_seniority,
    preferred_location: (data.preferred_location as string) ?? DEFAULTS.preferred_location,
    job_type: (data.job_type as string[]) ?? DEFAULTS.job_type,
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
              className="w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-text outline-none focus:border-text-muted"
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              The AI reads this directly — titles, skills, and anything you want to avoid, all
              in your own words.
            </p>
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
