"use client";

import { useCallback, useEffect, useState } from "react";
import { JobResults } from "@/components/JobResults";
import type { Job, JobStatus, Platform } from "@/lib/mock-data";
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
    description: row.description,
    status: (row.status as JobStatus | null) ?? null,
    isStale: match?.stale_at != null,
    isScored: match != null,
    match: match
      ? {
          skillOverlap: match.skill_overlap_pct ?? 0,
          seniorityFit: match.seniority_fit ?? 0,
          locationFit: match.location_fit ?? 0,
          employmentFit: match.employment_fit ?? 0,
          reasoning: match.reasoning,
          blocker: match.blocker ?? null,
        }
      : undefined,
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

  async function updateJobStatus(jobId: string, status: JobStatus | null) {
    const prev = jobs;
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
      setJobs(prev);
    }
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="bg-[#DFE9F0] px-4 pt-3 pb-6 sm:min-h-screen sm:py-8 sm:pr-8 sm:pl-0"
    >
      <h1 className="mb-4 text-xl font-semibold tracking-tight text-[#1E2A3D] sm:text-2xl">
        Job matches
      </h1>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
        <div className="w-full rounded-2xl border border-white bg-linear-to-b from-white to-[#F5FAFD] px-4 py-3 shadow-[0_10px_30px_-14px_rgba(30,64,120,0.3)] sm:w-44 sm:px-5 sm:py-4">
          <p className="text-[13px] text-text-faint">Jobs found</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#1E2A3D]">{jobs.length}</p>
        </div>
        <div className="w-full rounded-2xl border border-white bg-linear-to-b from-white to-[#F5FAFD] px-4 py-3 shadow-[0_10px_30px_-14px_rgba(30,64,120,0.3)] sm:w-44 sm:px-5 sm:py-4">
          <p className="text-[13px] text-text-faint">High matches</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{highMatches}</p>
        </div>
      </div>

      <JobResults
        jobs={jobs}
        lastScraped={lastScraped}
        onScraped={() => {
          setLastScraped("Just now");
          fetchJobs();
        }}
        onRefresh={fetchJobs}
        onStatusChange={updateJobStatus}
      />
    </main>
  );
}
