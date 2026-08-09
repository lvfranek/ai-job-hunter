"use client";

import { useEffect, useState } from "react";
import { CircleNotch, DownloadSimple, X } from "@phosphor-icons/react/dist/ssr";
import type { CoverLetterLanguage } from "@/lib/agents/agent-4";

type Status = "idle" | "generating" | "done" | "error";

export function CoverLetterModal({
  job,
  onClose,
}: {
  job: { id: string; title: string; company: string };
  onClose: () => void;
}) {
  const [language, setLanguage] = useState<CoverLetterLanguage>("de");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);

  // Revoke the blob URL when the modal closes or a new letter is generated.
  useEffect(() => {
    return () => {
      if (download) URL.revokeObjectURL(download.url);
    };
  }, [download]);

  async function handleGenerate() {
    setStatus("generating");
    setError("");
    setDownload(null);
    try {
      const res = await fetch("/api/coverletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, language }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Something went wrong. Try again.");
      }

      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "cover-letter.docx";
      const blob = await res.blob();
      setDownload({ url: URL.createObjectURL(blob), filename });
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-5 shadow-[0_20px_50px_-20px_rgba(30,64,120,0.4)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1E2A3D]">Generate Cover Letter</h2>
            <p className="mt-1 text-[13px] text-[#64748B]">
              Applying to: {job.title} at {job.company}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#94A3B8] hover:text-[#1E2A3D]"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-[13px] font-medium text-[#64748B]">
            Language
          </label>
          <div className="flex gap-2">
            {(["de", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  language === lang
                    ? "border-[#101828] bg-[#E4EEF5] text-[#1E2A3D]"
                    : "border-[#B9CCDA] text-[#64748B] hover:border-[#8FA8BD] hover:bg-[#E4EEF5] hover:text-[#1E2A3D]"
                }`}
              >
                {lang === "de" ? "Deutsch" : "English"}
              </button>
            ))}
          </div>
        </div>

        {status === "error" && (
          <p className="mt-4 rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-[12px] text-rose-800">
            {error}
          </p>
        )}

        <div className="mt-5">
          {status === "done" && download ? (
            <a
              href={download.url}
              download={download.filename}
              title={download.filename}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#101828] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98]"
            >
              <DownloadSimple size={15} weight="bold" className="shrink-0" />
              <span className="truncate">Download {download.filename}</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={status === "generating"}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#101828] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98] disabled:opacity-50"
            >
              {status === "generating" && (
                <CircleNotch size={15} className="animate-spin" />
              )}
              {status === "generating" ? "Generating your cover letter…" : "Generate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
