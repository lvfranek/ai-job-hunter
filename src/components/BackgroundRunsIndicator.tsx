"use client";

import { usePathname } from "next/navigation";
import { AgentStatus } from "@/components/AgentStatus";
import { useBackgroundRuns } from "@/lib/background-runs";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

// The dashboard shows scrape/score progress inline. Every other page gets this
// floating card, so a run started there stays visible while you work elsewhere.
export function BackgroundRunsIndicator() {
  const pathname = usePathname();
  const { isScraping, scrapeProgress, scrapeOutcome, isScoring, scoreStatus } = useBackgroundRuns();
  // The form pages' SaveBar sits at the bottom while there are unsaved changes —
  // move up out of its way instead of covering its Save button.
  const { dirty } = useUnsavedChanges();

  if (pathname === "/" || pathname === "/login") return null;

  const showScrape = isScraping || scrapeOutcome !== null;
  const showScore = isScoring || scoreStatus !== null;
  if (!showScrape && !showScore) return null;

  return (
    <div
      className={`fixed right-4 left-4 z-20 flex flex-col gap-2 rounded-2xl border border-white bg-linear-to-b from-white to-[#F5FAFD] px-4 py-3 shadow-[0_16px_40px_-12px_rgba(30,64,120,0.45)] transition-[bottom] duration-200 sm:left-auto sm:w-80 ${
        dirty ? "bottom-20" : "bottom-4"
      }`}
    >
      {showScrape && (
        <AgentStatus
          status={
            isScraping
              ? {
                  state: "scraping",
                  action: "Scraping job boards",
                  detail:
                    scrapeProgress.totalRuns > 0
                      ? `Board ${scrapeProgress.completedRuns}/${scrapeProgress.totalRuns} · ${scrapeProgress.found} found`
                      : `${scrapeProgress.found} found`,
                }
              : { state: "idle", action: scrapeOutcome ?? "", detail: "" }
          }
        />
      )}
      {showScore && (
        <AgentStatus
          status={
            isScoring
              ? { state: "scoring", action: "Scoring jobs", detail: scoreStatus ?? "Working…" }
              : { state: "idle", action: scoreStatus ?? "", detail: "" }
          }
        />
      )}
    </div>
  );
}
