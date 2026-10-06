"use client";

import { useState } from "react";
import { DownloadSimple, FileArrowUp } from "@phosphor-icons/react/dist/ssr";
import { buttonPrimary, buttonSecondary } from "@/components/controls";
import { DEMO_SAVE_MESSAGE } from "@/components/form";
import { Modal } from "@/components/Modal";
import { formatAppliedDate } from "@/components/applications/format";
import { CSV_TEMPLATE, parseApplicationsCsv, type ImportResult } from "@/lib/csv-import";
import { jobStatusLabels } from "@/lib/mock-data";

// Excel's "CSV UTF-8" is UTF-8; its plain "CSV" is Windows-1252, which would
// garble every umlaut if read as UTF-8.
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "applications-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Pick a CSV, check the preview, import the readable rows. */
export function ImportCsvModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = result && "rows" in result ? result.rows : [];
  const valid = rows.flatMap((r) => (r.ok ? [r.value] : []));
  const invalid = rows.length - valid.length;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(parseApplicationsCsv(await readText(file)));
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Import failed");
      const skipped = data.skipped ? `, ${data.skipped} skipped (link already tracked)` : "";
      onImported(
        data.demo
          ? DEMO_SAVE_MESSAGE
          : `${data.inserted} application${data.inserted === 1 ? "" : "s"} imported${skipped}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setImporting(false);
    }
  }

  return (
    <Modal
      title="Import applications from CSV"
      description="In Excel: File → Save As → CSV. Needs a job title and an employer column; date, status, link and salary are picked up when present."
      onClose={onClose}
      wide
    >
      <button
        type="button"
        onClick={downloadTemplate}
        className="mb-3 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-[#1E2A3D] underline-offset-2 hover:underline"
      >
        <DownloadSimple size={15} />
        Download CSV template
      </button>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#8FA8BD] bg-white px-4 py-5 text-[13px] text-[#1E2A3D] hover:bg-[#F1F7FB]">
        <FileArrowUp size={18} />
        {fileName ?? "Choose a .csv file"}
        <input
          type="file"
          accept=".csv,.txt,text/csv"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {result && "error" in result && (
        <p className="mt-3 text-[13px] text-rose-700">{result.error}</p>
      )}

      {result && "rows" in result && (
        <>
          <p className="mt-3 text-[12px] text-text-faint">Columns: {result.columns.join(" · ")}</p>
          <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-[#D5E2EB] bg-white">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[#F1F7FB] text-[12px] text-text-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Job title</th>
                  <th className="px-3 py-2 font-medium">Employer</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  row.ok ? (
                    <tr key={row.line} className="border-t border-[#E6EEF4]">
                      <td className="px-3 py-1.5 tabular-nums text-text-faint">{row.line}</td>
                      <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                        {formatAppliedDate(row.value.applied_at)}
                      </td>
                      <td className="px-3 py-1.5">{row.value.title}</td>
                      <td className="px-3 py-1.5">{row.value.company}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {jobStatusLabels[row.value.status]}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={row.line}
                      className="border-t border-[#E6EEF4] bg-rose-50 text-rose-800"
                    >
                      <td className="px-3 py-1.5 tabular-nums">{row.line}</td>
                      <td className="px-3 py-1.5" colSpan={4}>
                        {row.error} — <span className="opacity-70">{row.raw.join(" | ")}</span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          {invalid > 0 && (
            <p className="mt-2 text-[12px] text-rose-700">
              {invalid} row{invalid === 1 ? "" : "s"} can&apos;t be read and will be left out.
            </p>
          )}
        </>
      )}

      {error && <p className="mt-3 text-[13px] text-rose-700">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={valid.length === 0 || importing}
          className={buttonPrimary}
        >
          {importing
            ? "Importing…"
            : `Import ${valid.length} application${valid.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}
