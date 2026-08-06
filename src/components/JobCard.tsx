import {
  ArrowSquareOut,
  FileText,
  LinkedinLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Job } from "@/lib/mock-data";
import { platformIconSlugs, platformLabels } from "@/lib/mock-data";

function scoreTier(score: number) {
  if (score >= 80) {
    return {
      text: "text-score-high",
      bg: "bg-score-high/15",
      border: "border-score-high/30",
      label: "high fit",
    };
  }
  if (score >= 50) {
    return {
      text: "text-score-mid",
      bg: "bg-score-mid/15",
      border: "border-score-mid/30",
      label: "medium fit",
    };
  }
  return {
    text: "text-score-low",
    bg: "bg-score-low/15",
    border: "border-score-low/30",
    label: "low fit",
  };
}

export function JobCard({ job }: { job: Job }) {
  const tier = scoreTier(job.matchScore);

  return (
    <div className="flex flex-col gap-4 px-6 py-5 transition-colors hover:bg-white/3 sm:flex-row sm:items-center sm:gap-6">
      <div
        className={`flex h-8 w-14 shrink-0 items-center justify-center rounded-[10px] border ${tier.bg} ${tier.border}`}
        aria-label={`Match score ${job.matchScore}, ${tier.label}`}
      >
        <span className={`text-[13px] font-semibold tabular-nums leading-none ${tier.text}`}>
          {job.matchScore}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[16px] font-semibold text-text">{job.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-text-muted">
          <span>{job.company}</span>
          <span className="text-text-faint">·</span>
          <span className="text-[12px] text-text-faint">{job.postedDate}</span>
          {job.isStale && (
            <span className="rounded-md border border-score-mid/30 bg-score-mid/15 px-1.5 py-0.5 text-[11px] font-medium text-score-mid">
              Score outdated
            </span>
          )}
          <span className="ml-1 flex items-center gap-1.5">
            <span className="flex size-6 items-center justify-center rounded-lg border border-border-strong bg-surface-hover">
              {job.platform === "linkedin" ? (
                <LinkedinLogo size={12} weight="fill" className="text-text-faint" />
              ) : (
                <img
                  src={`https://cdn.simpleicons.org/${platformIconSlugs[job.platform]}/8b8b94`}
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

      <div className="flex shrink-0 items-center gap-2">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-normal text-text-muted transition-colors hover:bg-surface-hover hover:text-text active:scale-[0.98]"
        >
          <ArrowSquareOut size={15} weight="bold" />
          Open posting
        </a>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3.5 py-2 text-[13px] font-normal text-text-muted transition-colors hover:bg-surface-hover hover:text-text active:scale-[0.98]"
        >
          <FileText size={15} weight="bold" />
          Generate cover letter
        </button>
      </div>
    </div>
  );
}
