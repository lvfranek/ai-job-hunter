"use client";

import { useState } from "react";
import {
  ArrowSquareOut,
  Bank,
  Briefcase,
  CaretDown,
  FileText,
  LinkedinLogo,
  Prohibit,
} from "@phosphor-icons/react/dist/ssr";
import type { Job, JobMatchDetail, JobStatus } from "@/lib/mock-data";
import { JOB_STATUSES, jobStatusLabels, platformIconSlugs, platformLabels } from "@/lib/mock-data";
import { JobDescription } from "@/components/JobDescription";
import { buttonSecondary, Select } from "@/components/controls";

function scoreTier(score: number) {
  if (score >= 80) {
    return {
      text: "text-emerald-800",
      bg: "bg-emerald-100",
      border: "border-emerald-300",
      label: "high fit",
    };
  }
  if (score >= 50) {
    return {
      text: "text-amber-800",
      bg: "bg-amber-100",
      border: "border-amber-300",
      label: "medium fit",
    };
  }
  return {
    text: "text-rose-800",
    bg: "bg-rose-100",
    border: "border-rose-300",
    label: "low fit",
  };
}

function SubScore({ label, value }: { label: string; value: number }) {
  const tier = scoreTier(value);
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${tier.bg} ${tier.border}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`text-[15px] font-semibold tabular-nums leading-tight ${tier.text}`}>
        {value}
      </div>
    </div>
  );
}

function ScoreBreakdown({ match }: { match: JobMatchDetail }) {
  return (
    <div className="mb-4 rounded-xl border border-[#D7E4ED] bg-white p-3.5">
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        Why this score
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SubScore label="Skills" value={match.skillOverlap} />
        <SubScore label="Seniority" value={match.seniorityFit} />
        <SubScore label="Location" value={match.locationFit} />
        <SubScore label="Contract" value={match.employmentFit} />
      </div>
      {match.blocker && (
        <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-100 px-2.5 py-1 text-[12px] font-medium text-rose-800">
          <Prohibit size={13} weight="bold" />
          {match.blocker}
        </div>
      )}
      {match.reasoning ? (
        <p className="text-[13px] italic leading-relaxed text-[#1E2A3D]">
          &ldquo;{match.reasoning}&rdquo;
        </p>
      ) : (
        <p className="text-[12px] text-text-faint">No reasoning recorded for this job.</p>
      )}
    </div>
  );
}

const statusTier: Record<JobStatus, { text: string; bg: string; border: string }> = {
  interested: { text: "text-sky-900", bg: "bg-sky-200", border: "border-sky-400" },
  applied: { text: "text-green-900", bg: "bg-green-200", border: "border-green-500" },
  interview: { text: "text-violet-900", bg: "bg-violet-200", border: "border-violet-400" },
  not_interested: { text: "text-slate-700", bg: "bg-slate-200", border: "border-slate-400" },
};

export function JobCard({
  job,
  onGenerateCoverLetter,
  onStatusChange,
}: {
  job: Job;
  onGenerateCoverLetter: (job: Job) => void;
  onStatusChange: (jobId: string, status: JobStatus | null) => void;
}) {
  const tier = scoreTier(job.matchScore);
  const [expanded, setExpanded] = useState(false);
  // "Not interested" rows fade back so the list reads as what's still in play.
  // The status/cover-letter controls stay at full strength so it's easy to undo.
  const dimmed = job.status === "not_interested";
  const dimClass = dimmed ? "opacity-50 grayscale" : "";

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((exp) => !exp);
          }
        }}
        aria-expanded={expanded}
        className={`flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:gap-6 ${
          dimmed ? "bg-slate-100 hover:bg-slate-200/70" : "hover:bg-[#E9F2F8]"
        }`}
      >
        <div className={`flex shrink-0 items-center gap-1.5 ${dimClass}`}>
          {job.isScored ? (
            <div
              className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-xl border ${tier.bg} ${tier.border}`}
              aria-label={`Match score ${job.matchScore}, ${tier.label}`}
            >
              <span className={`text-[13px] font-semibold tabular-nums leading-none ${tier.text}`}>
                {job.matchScore}
              </span>
            </div>
          ) : (
            <div
              className="flex h-8 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C9D8E3] bg-[#EEF4F9]"
              aria-label="Not scored yet"
            >
              <span className="text-[11px] font-medium text-text-faint">—</span>
            </div>
          )}

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open posting"
            title="Open posting"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-faint transition-colors hover:text-[#1E2A3D] active:scale-[0.98]"
          >
            <ArrowSquareOut size={17} weight="bold" />
          </a>
          <CaretDown
            size={15}
            weight="bold"
            className={`ml-auto shrink-0 text-text-faint transition-transform sm:hidden ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        <div className={`min-w-0 flex-1 ${dimClass}`}>
          <h2 className="truncate text-[16px] font-semibold text-[#1E2A3D]">{job.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-text-muted">
            <span>{job.company}</span>
            <span className="text-[#B8C4D1]">·</span>
            <span className="text-[12px] text-text-faint">{job.postedDate}</span>
            {job.isStale && (
              <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                Score outdated
              </span>
            )}
            <span className="ml-1 flex items-center gap-1.5">
              <span className="flex size-6 items-center justify-center rounded-lg border border-[#C9D8E3] bg-[#EEF4F9]">
                {job.platform === "linkedin" ? (
                  <LinkedinLogo size={12} weight="fill" className="text-text-faint" />
                ) : job.platform === "arbeitsagentur" ? (
                  <Bank size={12} weight="fill" className="text-text-faint" />
                ) : job.platform === "stepstone" ? (
                  <Briefcase size={12} weight="fill" className="text-text-faint" />
                ) : (
                  <img
                    src={`https://cdn.simpleicons.org/${platformIconSlugs[job.platform]}/94A3B8`}
                    alt=""
                    width={12}
                    height={12}
                  />
                )}
              </span>
              <span className="text-[12px] text-text-faint">{platformLabels[job.platform]}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            value={job.status ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(job.id, (e.target.value || null) as JobStatus | null);
            }}
            aria-label="Application status"
            colorClassName={
              job.status
                ? `${statusTier[job.status].bg} ${statusTier[job.status].border} ${statusTier[job.status].text}`
                : undefined
            }
            caretClassName={job.status ? statusTier[job.status].text : undefined}
          >
            <option value="">No status</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {jobStatusLabels[s]}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateCoverLetter(job);
            }}
            className={buttonSecondary}
          >
            <FileText size={14} weight="bold" />
            <span className="sm:hidden">Cover letter</span>
            <span className="hidden sm:inline">Generate cover letter</span>
          </button>
          <CaretDown
            size={15}
            weight="bold"
            className={`hidden shrink-0 text-text-faint transition-transform sm:block ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#D7E4ED] bg-[#EEF4F9] px-4 py-5">
          {job.match && <ScoreBreakdown match={job.match} />}
          <JobDescription text={job.description} />
        </div>
      )}
    </div>
  );
}
