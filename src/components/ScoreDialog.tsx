"use client";

import { useEffect, useState } from "react";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import { Checkbox } from "@/components/Checkbox";
import { Modal } from "@/components/Modal";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/controls";
import { jobStatusLabels, type Job, type JobStatus } from "@/lib/mock-data";
import { scoreFilterIncludes, type ScoreOptions, type ScoreScope } from "@/lib/rescore";

// Seconds the final "yes, score" button stays locked — every job costs AI credits.
const CONFIRM_DELAY_S = 3;

const SKIPPABLE: JobStatus[] = ["not_interested", "applied", "interview", "offer", "rejected"];

/**
 * Pick which jobs to (re)score, then confirm a second time after a short
 * forced wait. Scoring costs OpenRouter credits per job, so nothing starts on
 * a single click.
 */
export function ScoreDialog({
  jobs,
  onClose,
  onConfirm,
}: {
  jobs: Job[];
  onClose: () => void;
  onConfirm: (options: ScoreOptions) => void;
}) {
  const pendingCount = jobs.filter((j) => !j.isScored || j.isStale).length;
  const [scope, setScope] = useState<ScoreScope>(pendingCount > 0 ? "pending" : "all");
  const [skipStatuses, setSkipStatuses] = useState<JobStatus[]>(SKIPPABLE);
  const [limitAge, setLimitAge] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState(30);
  // null = choosing options; a number = on the confirm step, seconds left until it unlocks.
  const [countdown, setCountdown] = useState<number | null>(null);

  const options: ScoreOptions = {
    scope,
    skipStatuses,
    maxAgeDays: limitAge ? maxAgeDays : null,
  };
  const selected = jobs.filter(
    (j) =>
      (scope === "all" || !j.isScored || j.isStale) &&
      scoreFilterIncludes({ status: j.status, ageDays: j.daysAgo }, options),
  ).length;

  useEffect(() => {
    if (countdown === null || countdown === 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function toggleStatus(status: JobStatus) {
    setSkipStatuses((list) =>
      list.includes(status) ? list.filter((s) => s !== status) : [...list, status],
    );
  }

  const jobsLabel = `${selected} job${selected === 1 ? "" : "s"}`;

  if (countdown !== null) {
    return (
      <Modal title={`Score ${jobsLabel}?`} onClose={onClose}>
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            {scope === "all"
              ? `All ${jobsLabel} are sent to the AI again, even ones with a current score.`
              : `${jobsLabel} without a current score are sent to the AI.`}{" "}
            This uses OpenRouter credits for every job. A job that fails keeps its old score.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setCountdown(null)} className={buttonSecondary}>
            Back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(options)}
            disabled={countdown > 0}
            className={`${buttonPrimary} min-w-36 tabular-nums`}
          >
            {countdown > 0 ? `Wait ${countdown}s…` : `Yes, score ${jobsLabel}`}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Score jobs"
      description="Choose which jobs the AI should score."
      onClose={onClose}
    >
      <div className="space-y-5 overflow-y-auto">
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-medium text-[#1E2A3D]">Jobs</legend>
          {(
            [
              ["pending", `New and outdated scores only (${pendingCount})`],
              ["all", `All jobs — rescore everything (${jobs.length})`],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="score-scope"
                checked={scope === value}
                onChange={() => setScope(value)}
                className="accent-[#101828]"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-[#1E2A3D]">
            Skip jobs marked as
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {SKIPPABLE.map((status) => (
              <Checkbox
                key={status}
                label={jobStatusLabels[status]}
                checked={skipStatuses.includes(status)}
                onChange={() => toggleStatus(status)}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={limitAge}
              onChange={() => setLimitAge((v) => !v)}
              className="size-4 accent-[#101828]"
            />
            Skip jobs older than
          </label>
          <input
            type="number"
            min={1}
            value={maxAgeDays || ""}
            onChange={(e) => setMaxAgeDays(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
            disabled={!limitAge}
            aria-label="Maximum age in days"
            className={`${inputClass} w-20`}
          />
          <span className="text-[13px] text-text-muted">days</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[13px] text-text-muted">
          <strong className="text-[#1E2A3D] tabular-nums">{jobsLabel}</strong> selected
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setCountdown(CONFIRM_DELAY_S)}
            disabled={selected === 0}
            className={buttonPrimary}
          >
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
}
