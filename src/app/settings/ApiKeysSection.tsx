"use client";

import { useEffect, useState } from "react";
import { buttonPrimary } from "@/components/controls";
import { ErrorBanner, Field, SettingsSection, textInputClass } from "@/components/form";

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
      const secrets = Object.fromEntries(Object.entries(secretInputs).filter(([, value]) => value));
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets, config }),
      });
      if (!res.ok) throw new Error("Failed to save API keys");
      const data = await res.json().catch(() => null);
      setSecretInputs({});
      await refresh();
      setMessage(data?.demo ? "Demo mode — changes aren't saved" : "API keys saved");
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

  const description = (
    <p>
      Your own Apify and OpenRouter credentials — stored encrypted, only used server-side. Leave
      blank to keep the value already configured via .env.local.
    </p>
  );

  if (loading) {
    return (
      <SettingsSection title="API keys" description={description}>
        <p className="text-[13px] text-text-faint">Loading…</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="API keys" description={description}>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {SECRETS.map(({ key, label }) => (
          <Field
            key={key}
            label={label}
            htmlFor={`secret-${key}`}
            hint={
              secretStatus[key]?.source === "db" && (
                <button
                  type="button"
                  onClick={() => handleClear(key)}
                  className="underline underline-offset-2 hover:text-text-muted"
                >
                  Clear override, fall back to .env.local
                </button>
              )
            }
          >
            <input
              id={`secret-${key}`}
              type="password"
              autoComplete="off"
              value={secretInputs[key] ?? ""}
              onChange={(e) => setSecretInputs({ ...secretInputs, [key]: e.target.value })}
              placeholder={statusText(secretStatus[key])}
              className={textInputClass}
            />
          </Field>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {CONFIG_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label} htmlFor={`config-${key}`}>
            <input
              id={`config-${key}`}
              value={config[key]}
              onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
              className={textInputClass}
            />
          </Field>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[#D7E4ED] pt-4">
        {message && <span className="text-[13px] text-emerald-700">{message}</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className={buttonPrimary}
        >
          {saving ? "Saving…" : "Save API keys"}
        </button>
      </div>
    </SettingsSection>
  );
}
