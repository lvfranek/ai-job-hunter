"use client";

import { useEffect, useRef, useState } from "react";
import { UserCircle, UploadSimple, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";
import { LanguageInput } from "@/components/LanguageInput";
import { Toast } from "@/components/Toast";
import { useDirtyGuard } from "@/lib/unsaved-changes";
import type { Language } from "@/lib/types";

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  languages: Language[];
  location: string;
  current_situation: string;
  cv_text: string;
  skills_frontend: string[];
  skills_backend: string[];
  skills_devops: string[];
  skills_soft: string[];
  skills_tools: string[];
}

function toLanguages(raw: unknown): Language[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === "string" ? { name: item, level: "fluent" } : (item as Language)
  );
}

function toForm(data: Record<string, unknown>): ProfileForm {
  return {
    name: (data.name as string) ?? "",
    email: (data.email as string) ?? "",
    phone: (data.phone as string) ?? "",
    date_of_birth: (data.date_of_birth as string) ?? "",
    languages: toLanguages(data.languages),
    location: (data.location as string) ?? "",
    current_situation: (data.current_situation as string) ?? "",
    cv_text: (data.cv_text as string) ?? "",
    skills_frontend: (data.skills_frontend as string[]) ?? [],
    skills_backend: (data.skills_backend as string[]) ?? [],
    skills_devops: (data.skills_devops as string[]) ?? [],
    skills_soft: (data.skills_soft as string[]) ?? [],
    skills_tools: (data.skills_tools as string[]) ?? [],
  };
}

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useDirtyGuard(
    form !== null && savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot
  );

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          const next = toForm(data);
          setForm(next);
          setSavedSnapshot(JSON.stringify(next));
        }
      });
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  async function handleFile(file: File) {
    setError(null);
    setParsing(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/parse", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse CV");
      setForm(toForm(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date_of_birth: form.date_of_birth || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      setSavedSnapshot(JSON.stringify(form));
      setMessage("Profile saved");
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
        <UserCircle size={15} />
        Profile
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Upload &amp; Configure Profile
        </h1>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-score-low/30 bg-score-low/15 px-3.5 py-2.5 text-[13px] text-score-low">
          {error}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`mb-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          dragOver ? "border-text-muted bg-surface-hover" : "border-border-strong bg-surface"
        }`}
      >
        {parsing ? (
          <>
            <CircleNotch size={22} className="animate-spin text-text-muted" />
            <p className="text-[13px] text-text-muted">Parsing your CV…</p>
          </>
        ) : (
          <>
            <UploadSimple size={22} className="text-text-faint" />
            <p className="text-[13px] text-text-muted">
              Drag &amp; drop your CV here, or{" "}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="font-medium text-text underline underline-offset-2"
              >
                browse
              </button>
            </p>
            <p className="text-[12px] text-text-faint">PDF, DOCX or TXT, up to 10MB</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {!form && !parsing && (
        <p className="text-[13px] text-text-faint">
          No profile yet. Upload a CV above to get started.
        </p>
      )}

      {form && (
        <div className="max-w-2xl space-y-10">
          <section className="space-y-5">
            <h2 className="text-[15px] font-semibold text-text">Personal Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Email
                </label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Phone
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Date of birth
                </label>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                  Location
                </label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Hamburg, Germany"
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
                />
              </div>
            </div>
            <LanguageInput
              languages={form.languages}
              onChange={(languages) => setForm({ ...form, languages })}
            />
          </section>

          <section className="space-y-5 border-t border-border-strong pt-8">
            <h2 className="text-[15px] font-semibold text-text">Professional Information</h2>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Current situation
              </label>
              <textarea
                value={form.current_situation}
                onChange={(e) => setForm({ ...form, current_situation: e.target.value })}
                rows={3}
                placeholder="e.g. Employed as Senior Developer at Acme Corp / Between jobs, studying data science / Freelancing since 2023"
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Full CV text
              </label>
              <textarea
                value={form.cv_text}
                onChange={(e) => setForm({ ...form, cv_text: e.target.value })}
                rows={8}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
          </section>

          <section className="space-y-5 border-t border-border-strong pt-8">
            <h2 className="text-[15px] font-semibold text-text">Skills</h2>
            <TagInput
              label="Frontend"
              tags={form.skills_frontend}
              onChange={(skills_frontend) => setForm({ ...form, skills_frontend })}
            />
            <TagInput
              label="Backend"
              tags={form.skills_backend}
              onChange={(skills_backend) => setForm({ ...form, skills_backend })}
            />
            <TagInput
              label="DevOps"
              tags={form.skills_devops}
              onChange={(skills_devops) => setForm({ ...form, skills_devops })}
            />
            <TagInput
              label="Soft skills"
              tags={form.skills_soft}
              onChange={(skills_soft) => setForm({ ...form, skills_soft })}
            />
            <TagInput
              label="Tools & other"
              helperText="Anything that doesn't fit the categories above"
              tags={form.skills_tools}
              onChange={(skills_tools) => setForm({ ...form, skills_tools })}
            />
          </section>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl border border-border-strong bg-surface px-4 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-border-strong bg-surface px-4 py-2 text-[13px] font-normal text-text-muted transition-colors hover:bg-surface-hover hover:text-text active:scale-[0.98]"
            >
              Re-upload CV
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
