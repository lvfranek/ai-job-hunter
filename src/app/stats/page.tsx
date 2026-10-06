"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info } from "@phosphor-icons/react/dist/ssr";
import { DEMO_SAVE_MESSAGE, ErrorBanner, PageHeader } from "@/components/form";
import { Toast } from "@/components/Toast";
import { BlockerMatrix, BoardMatrix } from "@/components/stats/Heatmaps";
import { Funnel } from "@/components/stats/Funnel";
import { KeywordScatter } from "@/components/stats/KeywordScatter";
import { KeywordTable } from "@/components/stats/KeywordTable";
import { Suggestions } from "@/components/stats/Suggestions";
import { fmtDate, fmtNumber, fmtPercent, StatsCard, StatTile } from "@/components/stats/ui";
import { useBackgroundRuns } from "@/lib/background-runs";
import { normalizeKeyword, type StatsResponse } from "@/lib/keyword-stats";

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#C9D6E2] bg-white/70 px-4 py-3 text-[13px] text-text-muted">
      <Info size={16} weight="fill" className="shrink-0 text-[#5B6B7F]" />
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

export default function StatsPage() {
  // Refetch when a scrape or scoring run finishes, wherever it was started.
  const { jobsVersion } = useBackgroundRuns();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/stats")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Loading statistics failed");
        return data as StatsResponse;
      })
      .then((data) => {
        if (ignore) return;
        setStats(data);
        setError(null);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      ignore = true;
    };
  }, [jobsVersion, reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Swap a paused or suggested keyword into the scraping settings — in place of
  // `outgoing`, or into a free slot when there is one.
  async function swapKeyword(incoming: string, outgoing: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const current = await res.json();
      if (!res.ok) throw new Error(current.error || "Loading settings failed");
      const list = ((current.scraper_search_keywords as string[] | null) ?? []).filter((k) =>
        k.trim(),
      );
      if (list.some((k) => normalizeKeyword(k) === incoming)) {
        setToast(`“${incoming}” is already an active keyword`);
        return;
      }
      const next = outgoing
        ? list.map((k) => (normalizeKeyword(k) === outgoing ? incoming : k))
        : [...list, incoming];

      const save = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scraper_search_keywords: next }),
      });
      const saved = await save.json();
      if (!save.ok) throw new Error(saved.error || "Saving keywords failed");
      setToast(
        saved.demo
          ? DEMO_SAVE_MESSAGE
          : outgoing
            ? `Swapped “${outgoing}” for “${incoming}” — applies from the next scrape`
            : `Added “${incoming}” — applies from the next scrape`,
      );
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const o = stats?.overview;
  const active = stats?.keywords.filter((k) => k.active) ?? [];
  const paused = stats?.keywords.filter((k) => !k.active).length ?? 0;

  return (
    <main id="main" tabIndex={-1} className="px-4 pt-3 pb-8 sm:pt-8 sm:pr-4 sm:pb-4 sm:pl-0">
      <Toast message={toast} />
      <PageHeader
        title="Statistics"
        description="All-time numbers per search keyword — which ones find jobs worth applying to, and which to rotate out."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!stats || !o ? (
        !error && <p className="text-[13px] text-text-muted">Loading statistics…</p>
      ) : (
        <div className="space-y-4">
          {!stats.trackingReady && (
            <Notice>
              Keyword tracking isn&apos;t set up yet. Run{" "}
              <code className="rounded bg-[#E4EEF5] px-1 text-[12px]">
                supabase/migrations/028_keyword_tracking.sql
              </code>{" "}
              in the Supabase SQL editor, then reload this page.
            </Notice>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="Jobs found"
              value={fmtNumber(o.totalJobs)}
              hint="All time, incl. removed"
            />
            <StatTile
              label="Average score"
              value={fmtNumber(o.avgScore)}
              hint={`${fmtNumber(o.scored)} scored`}
            />
            <StatTile
              label={`${stats.goodMatchScore}+ matches`}
              value={fmtNumber(o.goodMatches)}
              hint={`${fmtPercent(o.scored ? o.goodMatches / o.scored : null)} of scored`}
            />
            <StatTile
              label="Searches"
              value={fmtNumber(o.searches)}
              hint={o.trackedSince ? `Tracked since ${fmtDate(o.trackedSince)}` : "Not tracked yet"}
            />
            <StatTile
              label="Keywords"
              value={`${active.length} / ${stats.keywordSlots}`}
              hint={`${paused} paused`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <StatsCard
              title="Volume vs. quality"
              description="Right = finds more jobs per search, up = better average score. Rotate out what sits bottom-left."
            >
              <KeywordScatter keywords={stats.keywords} />
            </StatsCard>
            <StatsCard
              title="From found to applied"
              description="Every job ever scraped, and how far it got."
            >
              <Funnel steps={stats.funnel} />
            </StatsCard>
          </div>

          <StatsCard
            title="Keywords"
            description={
              <>
                Paused keywords keep their history, so you can compare them with today&apos;s and
                swap them back in. Open a row for its runs, job boards and overlap.
              </>
            }
          >
            {stats.keywords.length > 0 ? (
              <KeywordTable
                keywords={stats.keywords}
                slots={stats.keywordSlots}
                busy={busy}
                onSwap={swapKeyword}
              />
            ) : (
              <p className="text-[13px] text-text-muted">
                Add search keywords in Scraping Settings to start tracking them.
              </p>
            )}
          </StatsCard>

          <StatsCard
            title="Keyword × job board"
            description="Which board delivers the good matches for which keyword."
          >
            <BoardMatrix keywords={stats.keywords} boards={stats.boards} />
          </StatsCard>

          <StatsCard
            title="Why jobs fall through"
            description="Share of each keyword's scored jobs that hit a hard blocker. A keyword whose jobs keep failing on the same thing is searching the wrong market."
          >
            <BlockerMatrix keywords={stats.keywords} />
          </StatsCard>

          <StatsCard
            title="Keywords to try"
            description="Phrases that keep showing up in the titles of your 80+ matches and applications, but that none of your keywords covers yet."
          >
            <Suggestions
              suggestions={stats.suggestions}
              active={active}
              slots={stats.keywordSlots}
              busy={busy}
              onSwap={swapKeyword}
            />
          </StatsCard>
        </div>
      )}
    </main>
  );
}
