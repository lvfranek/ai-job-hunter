"use client";

import { useEffect, useState } from "react";

interface SecretStatus {
  configured: boolean;
  last4: string | null;
  source: "db" | "env" | "none";
}

interface ConfigForm {
  apify_scraper_indeed: string;
  apify_scraper_linkedin: string;
  apify_scraper_xing: string;
  apify_scraper_stepstone: string;
  apify_scraper_arbeitsagentur: string;
  openrouter_model: string;
}

const SECRETS: { key: "apify_api_key" | "openrouter_api_key"; label: string }[] = [
  { key: "apify_api_key", label: "Apify API token" },
  { key: "openrouter_api_key", label: "OpenRouter API key" },
];

const CONFIG_FIELDS: { key: keyof ConfigForm; label: string }[] = [
  { key: "apify_scraper_indeed", label: "Indeed actor ID" },
  { key: "apify_scraper_linkedin", label: "LinkedIn actor ID" },
  { key: "apify_scraper_xing", label: "Xing actor ID" },
  { key: "apify_scraper_stepstone", label: "Stepstone actor ID" },
  { key: "apify_scraper_arbeitsagentur", label: "Arbeitsagentur actor ID" },
  { key: "openrouter_model", label: "OpenRouter model" },
];

const EMPTY_CONFIG: ConfigForm = {
  apify_scraper_indeed: "",
  apify_scraper_linkedin: "",
  apify_scraper_xing: "",
  apify_scraper_stepstone: "",
  apify_scraper_arbeitsagentur: "",
  openrouter_model: "",
};

const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-[#101828]";

function statusText(status: SecretStatus | undefined) {
  if (!status || !status.configured) return "Not configured";
  const via = status.source === "db" ? "via Settings" : "via .env.local";
  return `Configured ${via} (••••${status.last4})`;
}

export function ApiKeysSection({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [secretStatus, setSecretStatus] = useState<Record<string, SecretStatus>>({});
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<ConfigForm>(EMPTY_CONFIG);
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState(JSON.stringify(EMPTY_CONFIG));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !loading &&
    (JSON.stringify(config) !== savedConfigSnapshot || Object.values(secretInputs).some(Boolean));

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function refresh() {
    return fetch("/api/credentials")
      .then((res) => res.json())
      .then((data) => {
        setSecretStatus(data.secrets ?? {});
        const nextConfig = { ...EMPTY_CONFIG, ...data.config };
        setConfig(nextConfig);
        setSavedConfigSnapshot(JSON.stringify(nextConfig));
      });
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const secrets = Object.fromEntries(
        Object.entries(secretInputs).filter(([, value]) => value)
      );
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets, config }),
      });
      if (!res.ok) throw new Error("Failed to save API keys");
      setSecretInputs({});
      await refresh();
      setMessage("API keys saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear(key: string) {
    setError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets: { [key]: "" } }),
      });
      if (!res.ok) throw new Error("Failed to clear key");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <p className="text-[13px] text-text-faint">Loading…</p>;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold text-text">API Keys</h2>
        <p className="text-[12px] text-text-faint">
          Your own Apify and OpenRouter credentials — stored encrypted, only used server-side.
          Leave blank to keep the value already configured via .env.local.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-100 px-3.5 py-2.5 text-[13px] text-rose-800">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {SECRETS.map(({ key, label }) => (
          <div key={key}>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              {label}
            </label>
            <input
              type="password"
              autoComplete="off"
              value={secretInputs[key] ?? ""}
              onChange={(e) => setSecretInputs({ ...secretInputs, [key]: e.target.value })}
              placeholder={statusText(secretStatus[key])}
              className={inputClass}
            />
            {secretStatus[key]?.source === "db" && (
              <button
                type="button"
                onClick={() => handleClear(key)}
                className="mt-1.5 text-[12px] text-text-faint underline hover:text-text-muted"
              >
                Clear override, fall back to .env.local
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {CONFIG_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
              {label}
            </label>
            <input
              value={config[key]}
              onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[#101828] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save API Keys"}
        </button>
        {message && <span className="text-[13px] text-emerald-700">{message}</span>}
      </div>
    </section>
  );
}
