"use client";

import { useEffect, useState } from "react";
import {
  ArrowSquareOut,
  FileArrowUp,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import { DEMO_SAVE_MESSAGE, ErrorBanner, PageHeader } from "@/components/form";
import { buttonPrimary, buttonSecondary, iconButton, Select } from "@/components/controls";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import { StatTile } from "@/components/stats/ui";
import { statusTier } from "@/components/JobCard";
import { ApplicationForm } from "@/components/applications/ApplicationForm";
import { ImportCsvModal } from "@/components/applications/ImportCsvModal";
import { formatAppliedDate } from "@/components/applications/format";
import type { ApplicationRow } from "@/lib/applications";
import {
  APPLIED_STATUSES,
  JOB_STATUSES,
  jobStatusLabels,
  MANUAL_PLATFORM,
  platformLabels,
  type JobStatus,
  type Platform,
} from "@/lib/mock-data";

function sourceLabel(platform: string): string {
  return platform === MANUAL_PLATFORM
    ? "Added by you"
    : (platformLabels[platform as Platform] ?? platform);
}

function StatusSelect({
  row,
  onChange,
}: {
  row: ApplicationRow;
  onChange: (status: JobStatus | null) => void;
}) {
  const tier = row.status ? statusTier[row.status] : null;
  return (
    <Select
      value={row.status ?? ""}
      onChange={(e) => onChange((e.target.value || null) as JobStatus | null)}
      aria-label={`Status of ${row.title}`}
      className="w-36"
      colorClassName={tier ? `${tier.bg} ${tier.border} ${tier.text}` : undefined}
      caretClassName={tier?.text}
    >
      {/* Clearing the status takes a scraped job back out of the tracker. */}
      {row.platform !== MANUAL_PLATFORM && <option value="">No status</option>}
      {JOB_STATUSES.map((s) => (
        <option key={s} value={s}>
          {jobStatusLabels[s]}
        </option>
      ))}
    </Select>
  );
}

function TitleLink({ row }: { row: ApplicationRow }) {
  if (!row.url) return <span className="font-medium text-[#1E2A3D]">{row.title}</span>;
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-start gap-1 font-medium text-[#1E2A3D] hover:underline"
    >
      {row.title}
      <ArrowSquareOut
        size={13}
        className="mt-0.5 shrink-0 text-text-faint group-hover:text-[#1E2A3D]"
      />
    </a>
  );
}

export default function ApplicationsPage() {
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // undefined = closed, null = adding a new one, a row = editing it.
  const [editing, setEditing] = useState<ApplicationRow | null | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<ApplicationRow | null>(null);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    let ignore = false;
    fetch("/api/applications")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Loading applications failed");
        return data as ApplicationRow[];
      })
      .then((data) => {
        if (ignore) return;
        setRows(data);
        setError(null);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      ignore = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleSaved(message: string) {
    setEditing(undefined);
    setImporting(false);
    setToast(message);
    setReload((n) => n + 1);
  }

  async function changeStatus(row: ApplicationRow, status: JobStatus | null) {
    const prev = rows;
    setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, status } : r)) ?? rs);
    try {
      const res = await fetch(`/api/jobs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status update failed");
      // The server may have filled in the application date.
      setRows(
        (rs) => rs?.map((r) => (r.id === row.id ? { ...r, applied_at: data.applied_at } : r)) ?? rs,
      );
    } catch (err) {
      setRows(prev);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmDelete() {
    const row = deleting;
    setDeleting(null);
    if (!row) return;
    try {
      const res = await fetch(`/api/jobs/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deleting failed");
      if (data.demo) setToast(DEMO_SAVE_MESSAGE);
      else setRows((rs) => rs?.filter((r) => r.id !== row.id) ?? rs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const count = (statuses: JobStatus[]) =>
    rows?.filter((r) => r.status && statuses.includes(r.status)).length ?? 0;

  function actions(row: ApplicationRow) {
    return (
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(row)}
          aria-label={`Edit ${row.title}`}
          className={iconButton}
        >
          <PencilSimple size={15} />
        </button>
        {row.platform === MANUAL_PLATFORM && (
          <button
            type="button"
            onClick={() => setDeleting(row)}
            aria-label={`Delete ${row.title}`}
            className={iconButton}
          >
            <Trash size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="px-4 pt-3 pb-8 sm:pt-8 sm:pr-4 sm:pb-4 sm:pl-0">
      <Toast message={toast} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Applications"
          description="Everything you applied to — jobs marked as applied on the dashboard, and ones you found elsewhere."
        />
        <div className="mb-6 flex gap-2">
          <button type="button" onClick={() => setImporting(true)} className={buttonSecondary}>
            <FileArrowUp size={15} />
            Import CSV
          </button>
          <button type="button" onClick={() => setEditing(null)} className={buttonPrimary}>
            <Plus size={15} weight="bold" />
            Add application
          </button>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {rows === null ? (
        !error && <p className="text-[13px] text-text-muted">Loading applications…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:flex sm:gap-4 [&>*]:sm:w-44">
            <StatTile label="Applied" value={count(APPLIED_STATUSES)} />
            <StatTile label="Interviews" value={count(["interview", "offer"])} />
            <StatTile label="Rejections" value={count(["rejected"])} />
          </div>

          {rows.length === 0 ? (
            <div className="rounded-3xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-6 text-[13px] text-text-muted shadow-[0_16px_40px_-18px_rgba(30,64,120,0.35)]">
              <p className="font-medium text-[#1E2A3D]">No applications yet.</p>
              <p className="mt-1">
                Mark a job as <em>Applied</em> on the dashboard, add one by hand, or import your
                spreadsheet: in Excel use File → Save As → CSV, then Import CSV.
              </p>
            </div>
          ) : (
            <section className="rounded-3xl border border-white bg-linear-to-b from-white to-[#F7FBFD] shadow-[0_16px_40px_-18px_rgba(30,64,120,0.35)]">
              {/* Desktop: table */}
              <table className="hidden w-full text-left text-[13px] md:table">
                <thead className="text-[12px] text-text-faint">
                  <tr>
                    <th className="px-5 pt-4 pb-2 font-medium">Applied on</th>
                    <th className="px-3 pt-4 pb-2 font-medium">Job title</th>
                    <th className="px-3 pt-4 pb-2 font-medium">Employer</th>
                    <th className="px-3 pt-4 pb-2 font-medium">Status</th>
                    <th className="px-3 pt-4 pb-2 font-medium">Salary</th>
                    <th className="px-5 pt-4 pb-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-[#E6EEF4] align-middle">
                      <td className="px-5 py-2.5 whitespace-nowrap tabular-nums text-text-muted">
                        {formatAppliedDate(row.applied_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <TitleLink row={row} />
                        <p className="text-[12px] text-text-faint">{sourceLabel(row.platform)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[#1E2A3D]">{row.company}</td>
                      <td className="px-3 py-2.5">
                        <StatusSelect row={row} onChange={(s) => changeStatus(row, s)} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">
                        {row.salary ?? "—"}
                      </td>
                      <td className="px-5 py-2.5">{actions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: cards */}
              <ul className="divide-y divide-[#E6EEF4] md:hidden">
                {rows.map((row) => (
                  <li key={row.id} className="space-y-2 p-4 text-[13px]">
                    <div>
                      <TitleLink row={row} />
                      <p className="text-text-muted">{row.company}</p>
                      <p className="text-[12px] text-text-faint">
                        {formatAppliedDate(row.applied_at)} · {sourceLabel(row.platform)}
                        {row.salary && ` · ${row.salary}`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <StatusSelect row={row} onChange={(s) => changeStatus(row, s)} />
                      {actions(row)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {editing !== undefined && (
        <ApplicationForm
          application={editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}
      {importing && <ImportCsvModal onClose={() => setImporting(false)} onImported={handleSaved} />}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete application"
        message={`Delete “${deleting?.title}” at ${deleting?.company}? This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </main>
  );
}
