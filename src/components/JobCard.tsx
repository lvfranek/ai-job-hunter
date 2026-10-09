"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowSquareOut,
  Bank,
  Briefcase,
  CaretDown,
  Check,
  CircleHalf,
  Eye,
  EyeSlash,
  FileText,
  LinkedinLogo,
  MapPin,
  Prohibit,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Chance, Requirement, RequirementKind, RequirementStatus } from "@/lib/chance";
import type { Job, JobMatchDetail, JobStatus } from "@/lib/mock-data";
import { JOB_STATUSES, jobStatusLabels, platformIconSlugs, platformLabels } from "@/lib/mock-data";
import { ChanceBadge, ChancePill } from "@/components/ChanceBadge";
import { JobDescription } from "@/components/JobDescription";
import { buttonSecondary, iconButton, Select } from "@/components/controls";

const REQUIREMENT_STATUS: Record<
  RequirementStatus,
  { label: string; chip: string; icon: string; Icon: typeof Check }
> = {
  met: {
    label: "You have it",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-700",
    Icon: Check,
  },
  partial: {
    label: "Partly",
    chip: "border-amber-300 bg-amber-50 text-amber-900",
    icon: "text-amber-700",
    Icon: CircleHalf,
  },
  missing: {
    label: "Missing",
    chip: "border-rose-300 bg-rose-50 text-rose-900",
    icon: "text-rose-700",
    Icon: X,
  },
};

const KIND_LABEL: Record<RequirementKind, string | null> = {
  skill: null,
  qualification: "required credential",
  language: "language",
};

function RequirementChip({ requirement }: { requirement: Requirement }) {
  const status = REQUIREMENT_STATUS[requirement.status];
  const kind = KIND_LABEL[requirement.kind];
  return (
    <li
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] ${status.chip}`}
      title={`${status.label}${kind ? ` · ${kind}` : ""}`}
    >
      <status.Icon size={12} weight="bold" className={`shrink-0 ${status.icon}`} />
      <span className="sr-only">{status.label}:</span>
      <span className="min-w-0 truncate">{requirement.text}</span>
      {kind && <span className="shrink-0 text-[11px] opacity-70">· {kind}</span>}
    </li>
  );
}

function ChanceBreakdown({ chance, match }: { chance: Chance; match: JobMatchDetail }) {
  const { requirements, downgrades, blocker, reasoning } = match;
  const metCount = requirements.filter((r) => r.status === "met").length;
  return (
    <div className="mb-4 rounded-xl border border-[#D7E4ED] bg-white p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
          Why this chance
        </div>
        <ChancePill chance={chance} />
      </div>

      {blocker && (
        <ul className="mb-2.5 flex flex-wrap gap-1.5">
          {blocker.split("; ").map((reason) => (
            <li
              key={reason}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-100 px-2.5 py-1 text-[12px] font-medium text-rose-800"
            >
              <Prohibit size={13} weight="bold" className="shrink-0" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {requirements.length > 0 ? (
        <>
          <p className="mb-1.5 text-[12px] text-text-muted">
            You meet {metCount} of {requirements.length} must-haves
          </p>
          <ul className="mb-3 flex flex-wrap gap-1.5">
            {requirements.map((r) => (
              <RequirementChip key={r.text} requirement={r} />
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-3 text-[12px] text-text-faint">
          The posting names no concrete must-haves.
        </p>
      )}

      {downgrades.length > 0 && (
        <ul className="mb-3 space-y-1">
          {downgrades.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5 text-[12px] text-text-muted">
              <ArrowDown size={12} weight="bold" className="mt-0.5 shrink-0 text-amber-700" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {reasoning ? (
        <p className="text-[13px] italic leading-relaxed text-[#1E2A3D]">
          &ldquo;{reasoning}&rdquo;
        </p>
      ) : (
        <p className="text-[12px] text-text-faint">No reasoning recorded for this job.</p>
      )}
    </div>
  );
}

export const statusTier: Record<JobStatus, { text: string; bg: string; border: string }> = {
  interested: { text: "text-sky-900", bg: "bg-sky-200", border: "border-sky-400" },
  applied: { text: "text-green-900", bg: "bg-green-200", border: "border-green-500" },
  interview: { text: "text-violet-900", bg: "bg-violet-200", border: "border-violet-400" },
  offer: { text: "text-amber-900", bg: "bg-amber-200", border: "border-amber-400" },
  rejected: { text: "text-rose-900", bg: "bg-rose-200", border: "border-rose-400" },
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
  const [expanded, setExpanded] = useState(false);
  // The panel is mounted on first open and kept afterwards, so closing can
  // animate out instead of vanishing.
  const [hasOpened, setHasOpened] = useState(false);
  const toggle = () => {
    setHasOpened(true);
    setExpanded((e) => !e);
  };
  // "Not interested" rows are hidden from the list by default; when shown, they
  // fade back so the list reads as what's still in play. The controls stay at
  // full strength so it's easy to undo.
  const dimmed = job.status === "not_interested";
  const dimClass = dimmed ? "opacity-50 grayscale" : "";

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={expanded}
        className={`flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:gap-6 ${
          dimmed ? "bg-slate-100 hover:bg-slate-200/70" : "hover:bg-[#E9F2F8]"
        }`}
      >
        <div className={`flex shrink-0 items-center gap-1.5 ${dimClass}`}>
          <ChanceBadge chance={job.chance} />

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
            className={`ml-auto shrink-0 text-text-faint transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] sm:hidden ${expanded ? "rotate-180" : ""}`}
          />
        </div>

        <div className={`min-w-0 flex-1 ${dimClass}`}>
          <h2 className="truncate text-[16px] font-semibold text-[#1E2A3D]">{job.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-text-muted">
            <span>{job.company}</span>
            {job.location && (
              <>
                <span className="text-[#B8C4D1]">·</span>
                <span className="flex min-w-0 items-center gap-1 text-[12px] text-text-faint">
                  <MapPin size={12} weight="fill" className="shrink-0" />
                  <span className="max-w-56 truncate">{job.location}</span>
                  {/* 0 km means it's in one of your cities — the name says enough. */}
                  {job.distanceKm !== null && job.distanceKm > 0 && (
                    <span className="shrink-0 tabular-nums">· {job.distanceKm} km</span>
                  )}
                </span>
              </>
            )}
            <span className="text-[#B8C4D1]">·</span>
            <span className="text-[12px] text-text-faint">{job.postedDate}</span>
            {job.isStale && (
              <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                Outdated
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

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:flex sm:items-center">
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
            aria-label="Generate cover letter"
            className={buttonSecondary}
          >
            <FileText size={14} weight="bold" />
            Cover letter
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(job.id, dimmed ? null : "not_interested");
            }}
            aria-label={dimmed ? "Restore this job" : "Not interested — hide this job"}
            title={dimmed ? "Restore" : "Not interested"}
            className={iconButton}
          >
            {dimmed ? <Eye size={16} weight="bold" /> : <EyeSlash size={16} weight="bold" />}
          </button>
          <CaretDown
            size={15}
            weight="bold"
            className={`hidden shrink-0 text-text-faint transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] sm:block ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Height animates via grid-template-rows 0fr -> 1fr, which handles
          content of unknown height without measuring it. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        inert={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          {hasOpened && (
            <div
              className={`border-t border-[#D7E4ED] bg-[#EEF4F9] px-4 py-5 transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                expanded ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
              }`}
            >
              {job.chance && job.match && <ChanceBreakdown chance={job.chance} match={job.match} />}
              <JobDescription text={job.description} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
