import { SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { JobResults } from "@/components/JobResults";
import { mockJobs, mockLastScraped } from "@/lib/mock-data";

export default function DashboardPage() {
  const highMatches = mockJobs.filter((job) => job.matchScore >= 80).length;

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
            {mockJobs.length}
          </p>
        </div>
        <div className="w-44 rounded-lg border border-border bg-[#1A1A1D] px-5 py-4 shadow-lg shadow-black/50">
          <p className="text-[13px] text-text-muted">High matches</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-score-high">
            {highMatches}
          </p>
        </div>
      </div>

      <JobResults jobs={mockJobs} lastScraped={mockLastScraped} />
    </main>
  );
}
