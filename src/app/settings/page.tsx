"use client";

import { useEffect, useState } from "react";
import { GearSix } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";
import { Checkbox } from "@/components/Checkbox";
import { Toast } from "@/components/Toast";
import { useDirtyGuard } from "@/lib/unsaved-changes";

interface PortalToggles {
  indeed: boolean;
  linkedin: boolean;
  xing: boolean;
  stepstone: boolean;
  arbeitsagentur: boolean;
}

interface SettingsForm {
  scraper_search_keywords: string[];
  scraper_location: string;
  scraper_max_posting_age_days: number;
  scraper_results_per_scan: number;
  portal_toggles: PortalToggles;
}

const PORTALS: { key: keyof PortalToggles; label: string }[] = [
  { key: "indeed", label: "Indeed" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "xing", label: "Xing" },
  { key: "stepstone", label: "Stepstone" },
  { key: "arbeitsagentur", label: "Arbeitsagentur" },
];

const DEFAULTS: SettingsForm = {
  scraper_search_keywords: [],
  scraper_location: "",
  scraper_max_posting_age_days: 30,
  scraper_results_per_scan: 100,
  portal_toggles: {
    indeed: true,
    linkedin: true,
    xing: true,
    stepstone: true,
    arbeitsagentur: true,
  },
};

function toForm(data: Record<string, unknown>): SettingsForm {
  return {
    scraper_search_keywords:
      (data.scraper_search_keywords as string[]) ?? DEFAULTS.scraper_search_keywords,
    scraper_location: (data.scraper_location as string) ?? DEFAULTS.scraper_location,
    scraper_max_posting_age_days:
      (data.scraper_max_posting_age_days as number) ?? DEFAULTS.scraper_max_posting_age_days,
    scraper_results_per_scan:
      (data.scraper_results_per_scan as number) ?? DEFAULTS.scraper_results_per_scan,
    portal_toggles: {
      ...DEFAULTS.portal_toggles,
      ...(data.portal_toggles as Partial<PortalToggles>),
    },
  };
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDirtyGuard(!loading && JSON.stringify(form) !== savedSnapshot);

  useEffect(() => {
    fetch("/api/settings")
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
    if (form.scraper_search_keywords.length === 0)
      return setError("Add at least one search keyword");
    if (!form.scraper_location.trim()) return setError("Add a scraper location");
    if (form.scraper_max_posting_age_days <= 0)
      return setError("Max posting age must be greater than 0");
    if (form.scraper_results_per_scan <= 0)
      return setError("Results per scan must be greater than 0");
    if (!Object.values(form.portal_toggles).some(Boolean))
      return setError("Select at least one job board to search");

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSavedSnapshot(JSON.stringify(form));
      setMessage("Settings saved");
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
        <GearSix size={15} />
        Settings
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Settings</h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-score-low/30 bg-score-low/15 px-3.5 py-2.5 text-[13px] text-score-low">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="max-w-2xl space-y-10">
          <section className="space-y-6">
            <div>
              <h2 className="text-[15px] font-semibold text-text">Job Board Search Settings</h2>
              <p className="text-[12px] text-text-faint">
                What to search for on Indeed, LinkedIn, etc.
              </p>
            </div>

            <TagInput
              label="Search keywords"
              helperText="Broad terms that job boards will search for"
              tags={form.scraper_search_keywords}
              onChange={(scraper_search_keywords) =>
                setForm({ ...form, scraper_search_keywords })
              }
            />

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Location
              </label>
              <input
                value={form.scraper_location}
                onChange={(e) => setForm({ ...form, scraper_location: e.target.value })}
                placeholder="Hamburg, Germany"
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
              <p className="mt-1.5 text-[12px] text-text-faint">Where to search for jobs</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Max posting age (days)
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.scraper_max_posting_age_days}
                  onChange={(e) =>
                    setForm({ ...form, scraper_max_posting_age_days: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
                <p className="mt-1.5 text-[12px] text-text-faint">
                  Only show jobs posted within this many days
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Results per scan
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.scraper_results_per_scan}
                  onChange={(e) =>
                    setForm({ ...form, scraper_results_per_scan: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
                <p className="mt-1.5 text-[12px] text-text-faint">
                  How many jobs to fetch per scrape (more = longer)
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Which job boards should we search?
              </label>
              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border-strong bg-surface px-3.5 py-3">
                {PORTALS.map(({ key, label }) => (
                  <Checkbox
                    key={key}
                    label={label}
                    checked={form.portal_toggles[key]}
                    onChange={() =>
                      setForm({
                        ...form,
                        portal_toggles: {
                          ...form.portal_toggles,
                          [key]: !form.portal_toggles[key],
                        },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </section>

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
