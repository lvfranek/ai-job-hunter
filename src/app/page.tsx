"use client";

import { useCallback, useEffect, useState } from "react";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { JobResults } from "@/components/JobResults";
import type { Job, Platform } from "@/lib/mock-data";
import type { JobWithMatch } from "@/lib/types";

function formatDaysAgo(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function toUiJob(row: JobWithMatch): Job {
  const match = row.job_matches;
  const posted = row.posted_date || row.created_at;
  const daysAgo = Math.max(0, Math.floor((Date.now() - new Date(posted).getTime()) / 86400000));
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    matchScore: match?.match_score ?? 0,
    postedDate: formatDaysAgo(daysAgo),
    daysAgo,
    platform: (row.platform as Platform) ?? "indeed",
    url: row.url,
    isStale: match?.stale_at != null,
    isScored: match != null,
  };
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastScraped, setLastScraped] = useState("Never");

  const fetchJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(Array.isArray(data) ? data.map(toUiJob) : []);
  }, []);

  useEffect(() => {
    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => setJobs(Array.isArray(data) ? data.map(toUiJob) : []));
  }, []);

  const highMatches = jobs.filter((job) => job.matchScore >= 80).length;

  return (
    <main className="px-8 py-8">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-text-faint">
        <SquaresFour size={15} />
        Dashboard
      </div>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-text">
        Job matches
      </h1>

      <div className="mb-4 flex flex-wrap gap-4">
        <div className="w-44 rounded-lg border border-border bg-[#1A1A1D] px-5 py-4 shadow-lg shadow-black/50">
          <p className="text-[13px] text-text-muted">Jobs found</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-text">
            {jobs.length}
          </p>
        </div>
        <div className="w-44 rounded-lg border border-border bg-[#1A1A1D] px-5 py-4 shadow-lg shadow-black/50">
          <p className="text-[13px] text-text-muted">High matches</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-score-high">
            {highMatches}
          </p>
        </div>
      </div>

      <JobResults
        jobs={jobs}
        lastScraped={lastScraped}
        onScraped={() => {
          setLastScraped("Just now");
          fetchJobs();
        }}
      />
    </main>
  );
}
