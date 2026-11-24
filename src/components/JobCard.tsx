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
  LinkedinLogo,
  MapPin,
  PencilSimpleLine,
  Prohibit,
  X,
} from "@phosphor-icons/react/dist/ssr";
import type { Chance, Requirement, RequirementKind, RequirementStatus } from "@/lib/chance";
import type { Job, JobMatchDetail, JobStatus } from "@/lib/mock-data";
import { JOB_STATUSES, jobStatusLabels, platformIconSlugs, platformLabels } from "@/lib/mock-data";
import { ChanceBadge, ChancePill } from "@/components/ChanceBadge";
import { coreRequirements } from "@/lib/scoring-rules";
import { JobDescription } from "@/components/JobDescription";
import { RowAction, RowTooltip, rowActionClass, Select } from "@/components/controls";

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
      title={`${status.label}${kind ? ` · ${kind}` : ""}${requirement.evidence ? ` — from your profile: "${requirement.evidence}"` : ""}`}
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
  // The same split the tier is computed from (scoring-rules.ts): the key
  // requirements weigh most, the rest counts as a share.
  const key = coreRequirements(requirements);
  const groups = [
    { title: "Key requirements", items: key },
    { title: "Other must-haves", items: requirements.filter((r) => !key.includes(r)) },
  ].filter((group) => group.items.length > 0);
  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-3.5">
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
        <div className="mb-3 space-y-2.5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-[12px] text-text-muted">
                <span className="font-medium text-text">{group.title}</span> ·{" "}
                {group.items.filter((r) => r.status === "met").length} of {group.items.length} met
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {group.items.map((r) => (
                  <RequirementChip key={r.text} requirement={r} />
                ))}
              </ul>
            </div>
          ))}
        </div>
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
        <p className="text-[13px] italic leading-relaxed text-text">&ldquo;{reasoning}&rdquo;</p>
      ) : (
        <p className="text-[12px] text-text-faint">No reasoning recorded for this job.</p>
      )}
    </div>
  );
}

// How the job is worked, as the scorer confirmed it ("remote" only when the posting says so).
const ARRANGEMENT_TAG: Record<
  NonNullable<Job["arrangement"]>,
  { label: string; className: string }
> = {
  remote: { label: "Remote", className: "border-sky-300 bg-sky-50 text-sky-900" },
  hybrid: { label: "Hybrid", className: "border-violet-300 bg-violet-50 text-violet-900" },
  onsite: { label: "On-site", className: "border-slate-300 bg-slate-100 text-slate-800" },
};

export const statusTier: Record<JobStatus, { text: string; bg: string; border: string }> = {
  interested: { text: "text-sky-900", bg: "bg-sky-200", border: "border-sky-400" },
  applied: { text: "text-green-900", bg: "bg-green-200", border: "border-green-500" },
  interview: { text: "text-violet-900", bg: "bg-violet-200", border: "border-violet-400" },
  offer: { text: "text-amber-900", bg: "bg-amber-200", border: "border-amber-400" },
  rejected: { text: "text-rose-900", bg: "bg-rose-200", border: "border-rose-400" },
  not_interested: { text: "text-slate-700", bg: "bg-slate-200", border: "border-slate-400" },
};

/**
 * The job list's columns on wide screens; the header row in JobResults uses the
 * same template so the two line up.
 */
export const JOB_ROW_COLUMNS =
  "xl:grid-cols-[minmax(0,1fr)_6rem_5rem_minmax(0,11rem)_5rem_7.5rem_8rem_7.5rem]";

/** "3/3" key requirements met and "1/2" of the rest, as the breakdown counts them. */
function mustHaveCounts(requirements: Requirement[]) {
  if (requirements.length === 0) return null;
  const key = coreRequirements(requirements);
  const other = requirements.filter((r) => !key.includes(r));
  const met = (list: Requirement[]) =>
    `${list.filter((r) => r.status === "met").length}/${list.length}`;
  return { key: met(key), other: other.length > 0 ? met(other) : null };
}

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

  const counts = job.match ? mustHaveCounts(job.match.requirements) : null;

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
        className={`group/row flex cursor-pointer flex-col gap-2 px-4 py-3 text-[13px] transition-colors xl:grid xl:items-center xl:gap-3 xl:py-1.5 ${JOB_ROW_COLUMNS} ${
          dimmed ? "bg-slate-100 hover:bg-slate-200" : "hover:bg-surface-2"
        }`}
      >
        <div className={`flex min-w-0 items-baseline gap-1.5 ${dimClass}`}>
          <h2 className="truncate text-[14px] font-semibold text-text transition-colors group-hover/row:text-white xl:text-[13px]">
            {job.title}
          </h2>
          <span className="shrink-0 truncate text-text-faint xl:max-w-[45%]">{job.company}</span>
          {job.isStale && (
            <span className="shrink-0 self-center rounded-md border border-amber-300 bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800">
              Outdated
            </span>
          )}
        </div>

        {/* Mobile: one wrapping line of facts. Desktop: each fact is a column. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 xl:contents ${dimClass}`}>
          <ChanceBadge chance={job.chance} />
          <span>
            {job.arrangement && (
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${ARRANGEMENT_TAG[job.arrangement].className}`}
              >
                {ARRANGEMENT_TAG[job.arrangement].label}
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-text-muted">
            {job.location && !(job.location === "Remote" && job.arrangement === "remote") && (
              <>
                <MapPin size={12} weight="fill" className="shrink-0 text-text-faint xl:hidden" />
                <span className="truncate">{job.location}</span>
                {/* 0 km means it's in one of your cities — the name says enough. */}
                {job.distanceKm !== null && job.distanceKm > 0 && (
                  <span className="shrink-0 text-text-faint tabular-nums">
                    · {job.distanceKm} km
                  </span>
                )}
              </>
            )}
          </span>
          <span
            className="tabular-nums text-text-muted"
            title={counts ? "Met: key requirements · other must-haves" : undefined}
          >
            {counts ? (
              <>
                <span className="text-text">{counts.key}</span>
                {counts.other && <span className="text-text-faint"> · {counts.other}</span>}
                <span className="text-text-faint xl:hidden"> must-haves</span>
              </>
            ) : (
              <span className="text-text-faint">—</span>
            )}
          </span>
          <span className="flex items-center gap-2 text-text-faint">
            {job.postedDate}
            <span className="flex items-center" title={platformLabels[job.platform]}>
              {job.platform === "linkedin" ? (
                <LinkedinLogo size={13} weight="fill" />
              ) : job.platform === "arbeitsagentur" ? (
                <Bank size={13} weight="fill" />
              ) : job.platform === "stepstone" ? (
                <Briefcase size={13} weight="fill" />
              ) : (
                <img
                  src={`https://cdn.simpleicons.org/${platformIconSlugs[job.platform]}/86868C`}
                  alt={platformLabels[job.platform]}
                  width={13}
                  height={13}
                />
              )}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1 xl:contents">
          <Select
            small
            className="mr-auto xl:mr-0"
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
          <span className="flex items-center justify-end gap-0.5">
            <RowAction
              label="Cover letter"
              className="hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onGenerateCoverLetter(job);
              }}
            >
              <PencilSimpleLine size={15} />
            </RowAction>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label="Open posting"
              className={rowActionClass}
            >
              <ArrowSquareOut size={15} />
              <RowTooltip label="Open posting" />
            </a>
            <RowAction
              label={dimmed ? "Restore" : "Not interested"}
              aria-label={dimmed ? "Restore this job" : "Not interested — hide this job"}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(job.id, dimmed ? null : "not_interested");
              }}
            >
              {dimmed ? <Eye size={15} /> : <EyeSlash size={15} />}
            </RowAction>
            <span className={rowActionClass} aria-hidden="true">
              <CaretDown
                size={14}
                weight="bold"
                className={`transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${expanded ? "rotate-180" : ""}`}
              />
            </span>
          </span>
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
              className={`border-t border-border bg-surface-2 px-4 py-5 transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
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
