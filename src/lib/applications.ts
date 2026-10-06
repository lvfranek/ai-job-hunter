import { JOB_STATUSES, type JobStatus } from "@/lib/mock-data";

/** One application as the tracker form and the CSV import send it. */
export interface ApplicationInput {
  title: string;
  company: string;
  status: JobStatus;
  applied_at: string | null; // YYYY-MM-DD
  url: string | null;
  salary: string | null;
}

/** A row of GET /api/applications. */
export interface ApplicationRow {
  id: string;
  title: string;
  company: string;
  url: string | null;
  platform: string;
  status: JobStatus | null;
  applied_at: string | null;
  salary: string | null;
  created_at: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Today as YYYY-MM-DD in local time — what a date input expects. */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function validateUrl(value: unknown): Result<string | null> {
  const url = optionalText(value);
  if (url === null) return { ok: true, value: null };
  if (!/^https?:\/\/\S+$/i.test(url))
    return { ok: false, error: "Link must start with http(s)://" };
  return { ok: true, value: url };
}

export function validateDate(value: unknown): Result<string | null> {
  const date = optionalText(value);
  if (date === null) return { ok: true, value: null };
  if (!isIsoDate(date)) return { ok: false, error: "Date must be YYYY-MM-DD" };
  return { ok: true, value: date };
}

export function isJobStatus(value: unknown): value is JobStatus {
  return JOB_STATUSES.includes(value as JobStatus);
}

/** Checks a whole application from the add form or the CSV import. */
export function validateApplication(raw: unknown): Result<ApplicationInput> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = optionalText(body.title);
  const company = optionalText(body.company);
  if (!title) return { ok: false, error: "Job title is required" };
  if (!company) return { ok: false, error: "Employer is required" };

  const status = body.status ?? "applied";
  if (!isJobStatus(status)) return { ok: false, error: "Invalid status" };

  const date = validateDate(body.applied_at);
  if (!date.ok) return date;
  const url = validateUrl(body.url);
  if (!url.ok) return url;

  return {
    ok: true,
    value: {
      title,
      company,
      status,
      applied_at: date.value,
      url: url.value,
      salary: optionalText(body.salary),
    },
  };
}
