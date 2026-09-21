"use client";

import { useEffect, useRef, useState } from "react";
import { UploadSimple, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { TagInput } from "@/components/TagInput";
import { LanguageInput } from "@/components/LanguageInput";
import {
  DEMO_SAVE_MESSAGE,
  ErrorBanner,
  Field,
  PageHeader,
  SaveBar,
  SettingsSection,
  textareaClass,
  textInputClass,
} from "@/components/form";
import { useDirtyGuard } from "@/lib/unsaved-changes";
import type { Language } from "@/lib/types";

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  languages: Language[];
  location: string;
  street_address: string;
  current_situation: string;
  cv_text: string;
  skills_frontend: string[];
  skills_backend: string[];
  skills_devops: string[];
  skills_tools: string[];
  personal_story: string;
  key_achievements: string[];
  motivation: string;
}

function toLanguages(raw: unknown): Language[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === "string" ? { name: item, level: "fluent" } : (item as Language),
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
    street_address: (data.street_address as string) ?? "",
    current_situation: (data.current_situation as string) ?? "",
    cv_text: (data.cv_text as string) ?? "",
    skills_frontend: (data.skills_frontend as string[]) ?? [],
    skills_backend: (data.skills_backend as string[]) ?? [],
    skills_devops: (data.skills_devops as string[]) ?? [],
    skills_tools: (data.skills_tools as string[]) ?? [],
    personal_story: (data.personal_story as string) ?? "",
    key_achievements: (data.key_achievements as string[]) ?? [],
    motivation: (data.motivation as string) ?? "",
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

  useDirtyGuard(form !== null && savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot);

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
          key_achievements: form.key_achievements.map((a) => a.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      const data = await res.json().catch(() => null);
      setSavedSnapshot(JSON.stringify(form));
      setMessage(data?.demo ? DEMO_SAVE_MESSAGE : "Profile saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = form !== null && savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot;

  return (
    <main id="main" tabIndex={-1} className="px-4 pt-3 pb-8 sm:pt-8 sm:pr-4 sm:pb-4 sm:pl-0">
      <PageHeader
        title="Cover Letter Profile"
        description="Used only for generating cover letters — not for AI job scoring."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="space-y-4">
        <SettingsSection
          title="CV"
          description={
            <p>
              Upload your CV and the fields below are filled in for you. You can edit everything
              afterwards.
            </p>
          }
        >
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
            className={`flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors ${
              dragOver ? "border-[#8FA8BD] bg-[#E9F2F8]" : "border-[#B9CCDA] bg-[#F5F9FC]"
            }`}
          >
            {parsing ? (
              <>
                <CircleNotch size={22} className="animate-spin text-text-muted" />
                <p className="text-[13px] text-text-muted">Parsing your CV…</p>
                <p className="text-[12px] text-text-faint">This can take up to a minute</p>
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
        </SettingsSection>

        {form && (
          <>
            <SettingsSection
              title="Personal information"
              description={<p>Goes into the header of every cover letter.</p>}
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Name" htmlFor="profile-name">
                  <input
                    id="profile-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={textInputClass}
                  />
                </Field>
                <Field label="Email" htmlFor="profile-email">
                  <input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={textInputClass}
                  />
                </Field>
                <Field label="Phone" htmlFor="profile-phone">
                  <input
                    id="profile-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={textInputClass}
                  />
                </Field>
                <Field label="Date of birth" htmlFor="profile-dob">
                  <input
                    id="profile-dob"
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                    className={textInputClass}
                  />
                </Field>
                <Field label="Street address" htmlFor="profile-street">
                  <input
                    id="profile-street"
                    value={form.street_address}
                    onChange={(e) => setForm({ ...form, street_address: e.target.value })}
                    placeholder="Musterstraße 12"
                    className={textInputClass}
                  />
                </Field>
                <Field
                  label="Location"
                  htmlFor="profile-location"
                  hint={<p>Used as the &quot;ZIP City&quot; line in your cover letter header</p>}
                >
                  <input
                    id="profile-location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="22765 Hamburg"
                    className={textInputClass}
                  />
                </Field>
              </div>
              <LanguageInput
                languages={form.languages}
                onChange={(languages) => setForm({ ...form, languages })}
              />
            </SettingsSection>

            <SettingsSection
              title="Professional background"
              description={<p>Gives the AI context on where you are in your career.</p>}
            >
              <Field label="Current situation" htmlFor="profile-current-situation">
                <textarea
                  id="profile-current-situation"
                  value={form.current_situation}
                  onChange={(e) => setForm({ ...form, current_situation: e.target.value })}
                  rows={3}
                  placeholder="e.g. Employed as Senior Developer at Acme Corp / Between jobs, studying data science / Freelancing since 2023"
                  className={textareaClass}
                />
              </Field>
              <Field label="Full CV text" htmlFor="profile-cv-text">
                <textarea
                  id="profile-cv-text"
                  value={form.cv_text}
                  onChange={(e) => setForm({ ...form, cv_text: e.target.value })}
                  rows={8}
                  className={textareaClass}
                />
              </Field>
            </SettingsSection>

            <SettingsSection
              title="Skills"
              description={<p>Grouped by area — the AI highlights the ones each job asks for.</p>}
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                  label="Tools & other"
                  helperText="Anything that doesn't fit the categories above"
                  tags={form.skills_tools}
                  onChange={(skills_tools) => setForm({ ...form, skills_tools })}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Cover letter content"
              description={<p>The personal material the AI adapts into each letter.</p>}
            >
              <Field
                label="Personal intro / opening story"
                htmlFor="profile-personal-story"
                hint={
                  <p>
                    Your personal hook — your biggest achievement or what drives you. The AI adapts
                    this to each job.
                  </p>
                }
              >
                <textarea
                  id="profile-personal-story"
                  value={form.personal_story}
                  onChange={(e) => setForm({ ...form, personal_story: e.target.value })}
                  rows={4}
                  placeholder={
                    'e.g. "After making €100k in my first year selling on Amazon, I realized ' +
                    'e-commerce was in my blood..."'
                  }
                  className={textareaClass}
                />
              </Field>
              <Field
                label="Key achievements"
                htmlFor="profile-key-achievements"
                hint={<p>One per line. The AI picks the most relevant ones per job.</p>}
              >
                <textarea
                  id="profile-key-achievements"
                  value={form.key_achievements.join("\n")}
                  onChange={(e) =>
                    setForm({ ...form, key_achievements: e.target.value.split("\n") })
                  }
                  rows={5}
                  placeholder={
                    "One achievement per line, e.g.\nGrew client revenue from €232k to €300k/month through PPC optimization\nShipped a React Native app used by 10k+ daily users"
                  }
                  className={textareaClass}
                />
              </Field>
              <Field label="Motivation / what you're looking for" htmlFor="profile-motivation">
                <textarea
                  id="profile-motivation"
                  value={form.motivation}
                  onChange={(e) => setForm({ ...form, motivation: e.target.value })}
                  rows={3}
                  placeholder="Why are you looking for a new role? What excites you about this field?"
                  className={textareaClass}
                />
              </Field>
            </SettingsSection>
          </>
        )}
      </div>

      {form && (
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          label="Save profile"
          error={error}
          savedMessage={message}
        />
      )}
    </main>
  );
}
