"use client";

import { useCallback, useEffect, useState } from "react";
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

  // The tiles count what's still in play — hidden jobs are out of the running.
  const activeJobs = jobs.filter((job) => job.status !== "not_interested");
  const tiles = [
    { label: "Jobs found", value: activeJobs.length, color: "text-[#1E2A3D]" },
    {
      label: "Very good chance",
      value: activeJobs.filter((job) => job.chance === "very_good").length,
      color: "text-emerald-600",
    },
    {
      label: "Good chance",
      value: activeJobs.filter((job) => job.chance === "good").length,
      color: "text-green-700",
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
      className="bg-[#DFE9F0] px-4 pt-3 pb-6 sm:min-h-screen sm:pt-8 sm:pr-4 sm:pb-4 sm:pl-0"
    >
      <h1 className="mb-4 text-xl font-semibold tracking-tight text-[#1E2A3D] sm:text-2xl">
        Job matches
      </h1>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="w-full rounded-2xl border border-white bg-linear-to-b from-white to-[#F5FAFD] px-3 py-3 shadow-[0_10px_30px_-14px_rgba(30,64,120,0.3)] sm:w-44 sm:px-5 sm:py-4"
          >
            <p className="text-[12px] text-text-faint sm:text-[13px]">{tile.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${tile.color}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <JobResults
        jobs={jobs}
        lastScraped={formatLastScraped(lastScrapedAt)}
        onRefresh={fetchJobs}
        onStatusChange={updateJobStatus}
      />
    </main>
  );
}
