"use client";

import { useState } from "react";
import {
  ArrowSquareOut,
  Bank,
  Briefcase,
  CaretDown,
  FileText,
  LinkedinLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Job } from "@/lib/mock-data";
import { platformIconSlugs, platformLabels } from "@/lib/mock-data";

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

export function JobCard({
  job,
  onGenerateCoverLetter,
}: {
  job: Job;
  onGenerateCoverLetter: (job: Job) => void;
}) {
  const tier = scoreTier(job.matchScore);
  const [expanded, setExpanded] = useState(false);

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
        className="flex cursor-pointer flex-col gap-3 px-4 py-3 transition-colors hover:bg-[#E9F2F8] sm:flex-row sm:items-center sm:gap-6"
      >
        <div className="flex shrink-0 items-center gap-1.5">
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
              <span className="text-[11px] font-medium text-[#94A3B8]">—</span>
            </div>
          )}

          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open posting"
            title="Open posting"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#94A3B8] transition-colors hover:text-[#1E2A3D] active:scale-[0.98]"
          >
            <ArrowSquareOut size={17} weight="bold" />
          </a>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold text-[#1E2A3D]">{job.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-[#64748B]">
            <span>{job.company}</span>
            <span className="text-[#B8C4D1]">·</span>
            <span className="text-[12px] text-[#94A3B8]">{job.postedDate}</span>
            {job.isStale && (
              <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                Score outdated
              </span>
            )}
            <span className="ml-1 flex items-center gap-1.5">
              <span className="flex size-6 items-center justify-center rounded-lg border border-[#C9D8E3] bg-[#EEF4F9]">
                {job.platform === "linkedin" ? (
                  <LinkedinLogo size={12} weight="fill" className="text-[#94A3B8]" />
                ) : job.platform === "arbeitsagentur" ? (
                  <Bank size={12} weight="fill" className="text-[#94A3B8]" />
                ) : job.platform === "stepstone" ? (
                  <Briefcase size={12} weight="fill" className="text-[#94A3B8]" />
                ) : (
                  <img
                    src={`https://cdn.simpleicons.org/${platformIconSlugs[job.platform]}/94A3B8`}
                    alt=""
                    width={12}
                    height={12}
                  />
                )}
              </span>
              <span className="text-[12px] text-[#94A3B8]">{platformLabels[job.platform]}</span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateCoverLetter(job);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-[#B9CCDA] bg-white px-3.5 py-2 text-[13px] font-normal text-[#64748B] shadow-[0_1px_2px_rgba(30,64,120,0.06)] transition-colors hover:border-[#8FA8BD] hover:bg-[#E4EEF5] hover:text-[#1E2A3D] active:scale-[0.98]"
          >
            <FileText size={15} weight="bold" />
            Generate cover letter
          </button>
          <CaretDown
            size={15}
            weight="bold"
            className={`shrink-0 text-[#94A3B8] transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#D7E4ED] bg-[#EEF4F9] px-4 py-5">
          {job.description ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#1E2A3D]">
              {job.description}
            </p>
          ) : (
            <p className="text-[13px] text-[#94A3B8]">No description available.</p>
          )}
        </div>
      )}
    </div>
  );
}
