"use client";

import { useEffect, useRef, useState } from "react";
import { UserCircle, UploadSimple, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";

interface ProfileForm {
  name: string;
  email: string;
  skills: string[];
  target_titles: string[];
  target_job_level: string;
  location: string;
  cv_text: string;
}

const JOB_LEVELS = ["junior", "mid", "senior", "lead", "principal"];

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setForm({
            name: data.name ?? "",
            email: data.email ?? "",
            skills: data.skills ?? [],
            target_titles: data.target_titles ?? [],
            target_job_level: data.target_job_level ?? "mid",
            location: data.location ?? "",
            cv_text: data.cv_text ?? "",
          });
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
      setForm({
        name: data.name ?? "",
        email: data.email ?? "",
        skills: data.skills ?? [],
        target_titles: data.target_titles ?? [],
        target_job_level: data.target_job_level ?? "mid",
        location: data.location ?? "",
        cv_text: data.cv_text ?? "",
      });
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
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      setMessage("Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="px-8 py-8">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-text-faint">
        <UserCircle size={15} />
        Profile
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Upload &amp; Configure Profile
        </h1>
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
        <div className="max-w-2xl space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
          </div>

          <TagInput
            label="Skills"
            tags={form.skills}
            onChange={(skills) => setForm({ ...form, skills })}
          />
          <TagInput
            label="Target titles"
            tags={form.target_titles}
            onChange={(target_titles) => setForm({ ...form, target_titles })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
                Target job level
              </label>
              <select
                value={form.target_job_level}
                onChange={(e) => setForm({ ...form, target_job_level: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
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
                Location
              </label>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-text-muted"
              />
            </div>
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
