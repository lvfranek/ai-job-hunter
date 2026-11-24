"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { JobResults } from "@/components/JobResults";
import { useBackgroundRuns } from "@/lib/background-runs";
import { coverageOf } from "@/lib/chance";
import { parseDbTimestamp } from "@/lib/db-time";
import type { Job, JobStatus, Platform } from "@/lib/mock-data";
import { SCORING_VERSION } from "@/lib/scoring-rules";
import type { JobWithMatch } from "@/lib/types";

function formatDaysAgo(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatLastScraped(iso: string | null) {
  if (!iso) return "Never";
  const minutes = Math.floor((Date.now() - parseDbTimestamp(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDaysAgo(Math.floor(hours / 24));
}

function toUiJob(row: JobWithMatch): Job {
  const match = row.job_matches;
  const posted = row.posted_date || row.created_at;
  const daysAgo = Math.max(
    0,
    Math.floor((Date.now() - parseDbTimestamp(posted).getTime()) / 86400000),
  );
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    chance: match?.chance ?? null,
    coverage: match ? coverageOf(match.requirements ?? []) : null,
    postedDate: formatDaysAgo(daysAgo),
    daysAgo,
    platform: (row.platform as Platform) ?? "indeed",
    url: row.url ?? "", // the dashboard never lists manual applications, the only URL-less rows
    description: row.description,
    location: match?.work_location ?? row.location ?? null,
    distanceKm: match?.distance_km ?? null,
    arrangement: match?.work_arrangement ?? null,
    status: (row.status as JobStatus | null) ?? null,
    isStale:
      match?.chance != null && (match.stale_at != null || match.scoring_version < SCORING_VERSION),
    // Rows from before the chance tiers have no tier — they count as unscored.
    isScored: match?.chance != null,
    match:
      match?.chance != null
        ? {
            requirements: match.requirements ?? [],
            downgrades: match.downgrades ?? [],
            reasoning: match.reasoning,
            blocker: match.blocker ?? null,
          }
        : undefined,
  };
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  // True only until the first answer arrives — later refreshes keep showing the
  // current list instead of flashing back to placeholders.
  const [loading, setLoading] = useState(true);
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);
  // Bumped by the app-wide scrape/score runner whenever a run brings in new jobs
  // or scores — including runs that finished while you were on another page.
  const { jobsVersion } = useBackgroundRuns();

  const fetchJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(Array.isArray(data) ? data.map(toUiJob) : []);
  }, []);

  useEffect(() => {
    // Refreshes overlap while scoring is live; drop answers that arrive late.
    let ignore = false;
    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setJobs(Array.isArray(data) ? data.map(toUiJob) : []);
      })
      .catch((error) => console.error("Loading jobs failed:", error))
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    fetch("/api/scrape/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore) setLastScrapedAt(data?.completedAt ?? null);
      })
      .catch((error) => console.error("Loading last scrape time failed:", error));
    return () => {
      ignore = true;
    };
  }, [jobsVersion]);

  // "Jobs found" counts every job, hidden ones too; the chance tiles count only
  // what's still in play — hidden jobs are out of the running.
  const activeJobs = jobs.filter((job) => job.status !== "not_interested");
  const tiles = [
    { label: "Jobs found", value: jobs.length, color: "text-text" },
    {
      label: "Very good chance",
      value: activeJobs.filter((job) => job.chance === "very_good").length,
      color: "text-emerald-700",
    },
    {
      label: "Good chance",
      value: activeJobs.filter((job) => job.chance === "good").length,
      color: "text-sky-700",
    },
  ];

  async function updateJobStatus(jobId: string, status: JobStatus | null) {
    const previous = jobs.find((j) => j.id === jobId)?.status ?? null;
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status } : j)));
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
    } catch (error) {
      console.error("Status update failed:", error);
      // Roll back only this job, and only if nothing changed it since — an
      // Undo clicked while this request was in flight must survive.
      setJobs((js) =>
        js.map((j) => (j.id === jobId && j.status === status ? { ...j, status: previous } : j)),
      );
    }
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="bg-bg px-4 pt-3 pb-6 sm:min-h-screen sm:px-6 sm:pt-6 sm:pb-6"
    >
      <h1 className="mb-4 text-xl font-semibold tracking-tight text-text">Job matches</h1>

      <div className="mb-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface sm:flex">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0 px-3 py-2.5 sm:w-48 sm:px-4">
            <p className="truncate text-[12px] text-text-faint">{tile.label}</p>
            {loading ? (
              <div aria-hidden className="mt-0.5 flex h-6 items-center">
                <CircleNotch size={16} weight="bold" className="animate-spin text-text-faint" />
              </div>
            ) : (
              <p className={`mt-0.5 text-[17px] font-semibold tabular-nums ${tile.color}`}>
                {tile.value}
              </p>
            )}
          </div>
        ))}
      </div>

      <JobResults
        jobs={jobs}
        loading={loading}
        lastScraped={formatLastScraped(lastScrapedAt)}
        onRefresh={fetchJobs}
        onStatusChange={updateJobStatus}
      />
    </main>
  );
}
