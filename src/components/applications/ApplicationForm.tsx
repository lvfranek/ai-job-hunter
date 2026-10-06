"use client";

import { useState, type FormEvent } from "react";
import { DEMO_SAVE_MESSAGE, Field, textInputClass } from "@/components/form";
import { buttonPrimary, buttonSecondary, Select } from "@/components/controls";
import { Modal } from "@/components/Modal";
import { todayIso, type ApplicationRow } from "@/lib/applications";
import { JOB_STATUSES, jobStatusLabels, MANUAL_PLATFORM, type JobStatus } from "@/lib/mock-data";

/**
 * Add a job you applied to outside the scraper, or edit a tracked one. A
 * scraped job's title, employer and link come from the board, so only its
 * date, status and salary are editable.
 */
export function ApplicationForm({
  application,
  onClose,
  onSaved,
}: {
  /** null = add a new manual application. */
  application: ApplicationRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isNew = application === null;
  const editablePosting = isNew || application.platform === MANUAL_PLATFORM;
  const [title, setTitle] = useState(application?.title ?? "");
  const [company, setCompany] = useState(application?.company ?? "");
  const [appliedAt, setAppliedAt] = useState(application?.applied_at ?? todayIso());
  const [status, setStatus] = useState<JobStatus | "">(
    application ? (application.status ?? "") : "applied",
  );
  const [url, setUrl] = useState(application?.url ?? "");
  const [salary, setSalary] = useState(application?.salary ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      ...(editablePosting && { title, company, url }),
      applied_at: appliedAt || null,
      status: status || null,
      salary,
    };
    try {
      const res = await fetch(isNew ? "/api/applications" : `/api/jobs/${application.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Saving failed");
      if (isNew && data?.skipped) throw new Error("A job with this link is already tracked");
      onSaved(data?.demo ? DEMO_SAVE_MESSAGE : isNew ? "Application added" : "Application updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isNew ? "Add application" : "Edit application"}
      description={isNew ? "For a job you found somewhere else." : undefined}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto">
        <Field label="Job title" htmlFor="app-title">
          <input
            id="app-title"
            className={`${textInputClass} disabled:opacity-60`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={!editablePosting}
            autoFocus={isNew}
          />
        </Field>
        <Field label="Employer" htmlFor="app-company">
          <input
            id="app-company"
            className={`${textInputClass} disabled:opacity-60`}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            disabled={!editablePosting}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Applied on" htmlFor="app-date">
            <input
              id="app-date"
              type="date"
              className={textInputClass}
              value={appliedAt}
              onChange={(e) => setAppliedAt(e.target.value)}
            />
          </Field>
          <Field label="Status" htmlFor="app-status">
            <Select
              id="app-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as JobStatus | "")}
            >
              {!editablePosting && <option value="">No status (remove from tracker)</option>}
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {jobStatusLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Link to the posting"
          htmlFor="app-url"
          hint={editablePosting ? "Optional" : "From the job board"}
        >
          <input
            id="app-url"
            type="url"
            placeholder="https://"
            className={`${textInputClass} disabled:opacity-60`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!editablePosting}
          />
        </Field>
        <Field label="Salary" htmlFor="app-salary" hint="Optional, e.g. 55–60k">
          <input
            id="app-salary"
            className={textInputClass}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
        </Field>

        {error && <p className="text-[13px] text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={buttonPrimary}>
            {saving ? "Saving…" : isNew ? "Add" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
