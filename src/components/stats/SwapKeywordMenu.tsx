"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowsLeftRight, Plus } from "@phosphor-icons/react/dist/ssr";
import type { KeywordStat } from "@/lib/keyword-stats";
import { buttonSecondary } from "@/components/controls";
import { fmtNumber, VerdictPill } from "@/components/stats/ui";

/**
 * Puts a keyword (paused or suggested) back into the scrape. With a free slot it
 * just adds it; with all slots taken it asks which active keyword to replace,
 * showing how each one is doing so the choice is informed.
 */
export function SwapKeywordMenu({
  incoming,
  active,
  slots,
  busy,
  onSwap,
}: {
  incoming: string;
  /** The currently active keywords' stats. */
  active: KeywordStat[];
  slots: number;
  busy: boolean;
  onSwap: (incoming: string, outgoing: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (active.length < slots) {
    return (
      <button
        type="button"
        onClick={() => onSwap(incoming, null)}
        disabled={busy}
        className={buttonSecondary}
      >
        <Plus size={14} weight="bold" />
        Add to search
      </button>
    );
  }

  // Weakest first — those are the natural candidates to rotate out.
  const order = { weak: 0, redundant: 1, new: 2, solid: 3, strong: 4 };
  const candidates = [...active].sort(
    (a, b) =>
      order[a.verdict] - order[b.verdict] || (a.goodPerSearch ?? 0) - (b.goodPerSearch ?? 0),
  );

  // The list opens in the flow, not as a floating popover: it lives inside the
  // keyword table's horizontal scroll container, which would clip a popover.
  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-expanded={open}
        className={buttonSecondary}
      >
        <ArrowsLeftRight size={14} weight="bold" />
        Swap in
      </button>
      {open && (
        <div className="mt-2 w-full max-w-80 rounded-2xl border border-[#D7E4ED] bg-white p-2 shadow-[0_10px_30px_-14px_rgba(30,64,120,0.3)]">
          <p className="px-2 pt-1 pb-2 text-[12px] text-text-muted">
            Replace which keyword with{" "}
            <span className="font-medium text-[#1E2A3D]">{incoming}</span>?
          </p>
          <ul>
            {candidates.map((k) => (
              <li key={k.keyword}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSwap(incoming, k.keyword);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px] text-[#1E2A3D] transition-colors hover:bg-[#E4EEF5] focus-visible:bg-[#E4EEF5] focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate">{k.keyword}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-faint">
                    {fmtNumber(k.goodPerSearch, 1)} 80+/search
                  </span>
                  <VerdictPill verdict={k.verdict} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
