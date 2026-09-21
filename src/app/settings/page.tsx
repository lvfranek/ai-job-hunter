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
  textInputClass,
} from "@/components/form";
import { useDirtyGuard } from "@/lib/unsaved-changes";
import { ApiKeysSection } from "./ApiKeysSection";

// Each portal is scraped once per keyword (most job boards return nothing for
// "kw1 OR kw2"), so keywords are a small fixed set, not a free list.
const KEYWORD_SLOTS = 5;

function padKeywords(list: string[]): string[] {
  return Array.from({ length: KEYWORD_SLOTS }, (_, i) => list[i] ?? "");
}

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
  remote_only: boolean;
  portal_toggles: PortalToggles;
  notification_threshold: number;
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
  scraper_results_per_scan: 25,
  remote_only: false,
  portal_toggles: {
    indeed: true,
    linkedin: true,
    xing: true,
    stepstone: true,
    arbeitsagentur: true,
  },
  notification_threshold: 75,
};

function toForm(data: Record<string, unknown>): SettingsForm {
  return {
    scraper_search_keywords: padKeywords(
      ((data.scraper_search_keywords as string[]) ?? DEFAULTS.scraper_search_keywords).slice(
        0,
        KEYWORD_SLOTS,
      ),
    ),
    scraper_location: (data.scraper_location as string) ?? DEFAULTS.scraper_location,
    scraper_max_posting_age_days:
      (data.scraper_max_posting_age_days as number) ?? DEFAULTS.scraper_max_posting_age_days,
    scraper_results_per_scan:
      (data.scraper_results_per_scan as number) ?? DEFAULTS.scraper_results_per_scan,
    remote_only: (data.remote_only as boolean) ?? DEFAULTS.remote_only,
    portal_toggles: {
      ...DEFAULTS.portal_toggles,
      ...(data.portal_toggles as Partial<PortalToggles>),
    },
    notification_threshold:
      (data.notification_threshold as number) ?? DEFAULTS.notification_threshold,
  };
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(DEFAULTS);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeysDirty, setApiKeysDirty] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(false);

  useDirtyGuard((!loading && JSON.stringify(form) !== savedSnapshot) || apiKeysDirty);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        const next = toForm(data);
        setForm(next);
        setSavedSnapshot(JSON.stringify(next));
        setWebhookConfigured(Boolean(data.webhook_configured));
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

    const cleanedKeywords = form.scraper_search_keywords
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, KEYWORD_SLOTS);
    if (cleanedKeywords.length === 0) return setError("Add at least one search keyword");
    if (!form.scraper_location.trim()) return setError("Add a scraper location");
    if (form.scraper_max_posting_age_days <= 0)
      return setError("Max posting age must be greater than 0");
    if (form.scraper_results_per_scan <= 0)
      return setError("Results per scan must be greater than 0");
    if (!Object.values(form.portal_toggles).some(Boolean))
      return setError("Select at least one job board to search");
    if (form.notification_threshold < 0 || form.notification_threshold > 100)
      return setError("Notification threshold must be between 0 and 100");

    const normalizedForm = { ...form, scraper_search_keywords: padKeywords(cleanedKeywords) };

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, scraper_search_keywords: cleanedKeywords }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      const data = await res.json().catch(() => null);
      setForm(normalizedForm);
      setSavedSnapshot(JSON.stringify(normalizedForm));
      setMessage(data?.demo ? DEMO_SAVE_MESSAGE : "Settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const activeKeywordCount = form.scraper_search_keywords.filter((k) => k.trim()).length;
  const activeBoardCount = Object.values(form.portal_toggles).filter(Boolean).length;
  const estimatedRuns = activeKeywordCount * activeBoardCount;
  const estimatedMaxJobs = estimatedRuns * (form.scraper_results_per_scan || 0);

  const dirty = !loading && JSON.stringify(form) !== savedSnapshot;

  return (
    <main id="main" tabIndex={-1} className="px-4 pt-3 pb-8 sm:pt-8 sm:pr-4 sm:pb-4 sm:pl-0">
      <PageHeader
        title="Scraping Settings"
        description="Adjust keywords, job boards, notifications and connections."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading ? (
        <p className="text-[13px] text-text-faint">Loading…</p>
      ) : (
        <div className="space-y-4">
          <SettingsSection
            title="Search"
            description={
              <>
                <p>What to look for on Indeed, LinkedIn and the other boards.</p>
                <p>
                  Indeed, LinkedIn, and Xing results can differ a little between scans a few minutes
                  apart — those sites rank their own search results and that ranking isn&apos;t
                  perfectly stable. Nothing you&apos;ve already seen gets added twice; duplicates
                  are always skipped.
                </p>
              </>
            }
          >
            <FieldGroup
              legend="Search keywords"
              hint={
                <p>
                  One keyword per field (each may be several words). Every board is scraped once per
                  keyword — most job boards return nothing for &quot;A OR B&quot;. Leave fields
                  blank to use fewer.
                </p>
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {form.scraper_search_keywords.map((keyword, i) => (
                  <input
                    key={i}
                    value={keyword}
                    onChange={(e) => {
                      const next = form.scraper_search_keywords.map((k, j) =>
                        j === i ? e.target.value : k,
                      );
                      setForm({ ...form, scraper_search_keywords: next });
                    }}
                    placeholder={
                      ["Software Entwickler", "Frontend Developer", "React Engineer", "", ""][i] ||
                      `Keyword ${i + 1}`
                    }
                    aria-label={`Keyword ${i + 1}`}
                    className={textInputClass}
                  />
                ))}
              </div>
            </FieldGroup>

            <Field
              label="Location"
              htmlFor="settings-location"
              hint={
                <p>
                  Where to search for jobs — still applies with Remote only on, e.g. &quot;remote
                  jobs based in Germany&quot; rather than remote jobs worldwide
                </p>
              }
            >
              <input
                id="settings-location"
                value={form.scraper_location}
                onChange={(e) => setForm({ ...form, scraper_location: e.target.value })}
                placeholder="Hamburg, Germany"
                className={textInputClass}
              />
            </Field>

            <div>
              <Checkbox
                label="Remote only"
                checked={form.remote_only}
                onChange={() => setForm({ ...form, remote_only: !form.remote_only })}
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">
                Narrows to remote positions, on top of the location above — doesn&apos;t search
                worldwide. Works on Indeed, LinkedIn, Stepstone, and Arbeitsagentur; on Xing
                it&apos;s approximated by adding &quot;remote&quot; to the search keywords, since
                that board has no dedicated remote filter.
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Volume & freshness"
            description={<p>How many jobs each scan fetches, and how old they may be.</p>}
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="Max posting age (days)"
                htmlFor="settings-max-age"
                hint={
                  <>
                    <p>
                      Only show jobs posted within this many days — each job board only offers a few
                      fixed windows (e.g. 24h/week/month), so this snaps to the closest one that
                      doesn&apos;t cut out jobs you asked for
                    </p>
                    <p>
                      This is your main lever for freshness on Indeed, LinkedIn, and Xing — none of
                      the three let us request &quot;newest first&quot; results, so a tighter window
                      is what actually keeps old postings out. Stepstone and Arbeitsagentur are
                      always sorted newest-first automatically.
                    </p>
                  </>
                }
              >
                <input
                  id="settings-max-age"
                  type="number"
                  min={1}
                  value={form.scraper_max_posting_age_days}
                  onChange={(e) =>
                    setForm({ ...form, scraper_max_posting_age_days: Number(e.target.value) })
                  }
                  className={textInputClass}
                />
              </Field>

              <Field
                label="Results per search"
                htmlFor="settings-results-per-scan"
                hint={
                  <>
                    <p>
                      Max jobs fetched per keyword, per board, per scan. A scan runs one search for
                      every keyword × board combination.
                    </p>
                    <p className="text-text-muted">
                      {activeKeywordCount} keyword{activeKeywordCount === 1 ? "" : "s"} ×{" "}
                      {activeBoardCount} board{activeBoardCount === 1 ? "" : "s"} ×{" "}
                      {form.scraper_results_per_scan || 0} ={" "}
                      <span className="font-medium">
                        up to {estimatedMaxJobs.toLocaleString()} jobs per scan
                      </span>{" "}
                      ({estimatedRuns} search{estimatedRuns === 1 ? "" : "es"})
                    </p>
                    {estimatedMaxJobs > 750 && (
                      <p className="rounded-xl border border-amber-300 bg-amber-100 px-3.5 py-2 text-amber-800">
                        That&apos;s a large scan — every search is a billed Apify run. Consider
                        fewer keywords or boards, or a lower number here.
                      </p>
                    )}
                  </>
                }
              >
                <input
                  id="settings-results-per-scan"
                  type="number"
                  min={1}
                  value={form.scraper_results_per_scan}
                  onChange={(e) =>
                    setForm({ ...form, scraper_results_per_scan: Number(e.target.value) })
                  }
                  className={textInputClass}
                />
              </Field>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Job boards"
            description={<p>Every selected board is searched once per keyword.</p>}
          >
            <FieldGroup legend="Which job boards should we search?">
              <CheckboxRow>
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
              </CheckboxRow>
            </FieldGroup>
          </SettingsSection>

          <SettingsSection
            title="Notifications"
            description={<p>For automated runs via the cron endpoint — see README for setup.</p>}
          >
            <Field
              label="Notification threshold"
              htmlFor="settings-notification-threshold"
              hint={
                <>
                  <p>
                    Jobs scoring at or above this trigger a webhook notification. Only affects the
                    webhook — the dashboard still shows every job regardless of score. Configure the
                    webhook URL via the <code>NOTIFICATION_WEBHOOK_URL</code> environment variable.
                  </p>
                  <p className="flex items-center gap-1.5 pt-1 text-text-muted">
                    <span
                      className={`size-2 rounded-full ${
                        webhookConfigured ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      aria-hidden="true"
                    />
                    {webhookConfigured ? "Webhook configured" : "No webhook configured"}
                  </p>
                </>
              }
            >
              <input
                id="settings-notification-threshold"
                type="number"
                min={0}
                max={100}
                value={form.notification_threshold}
                onChange={(e) =>
                  setForm({ ...form, notification_threshold: Number(e.target.value) })
                }
                className={`${textInputClass} max-w-40`}
              />
            </Field>
          </SettingsSection>

          <ApiKeysSection onDirtyChange={setApiKeysDirty} />
        </div>
      )}

      {!loading && (
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          label="Save settings"
          error={error}
          savedMessage={message}
        />
      )}
    </main>
  );
}
