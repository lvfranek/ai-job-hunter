"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Funnel, X } from "@phosphor-icons/react";
import { buttonSecondary, Select } from "@/components/controls";
import {
  CHANCE_OPTIONS,
  chanceOptionLabels,
  sortLabels,
  statusFilterLabels,
  WORKPLACES,
  workplaceLabels,
  type ChanceFilter,
  type Filters,
  type SortKey,
  type StatusFilter,
  type Workplace,
} from "@/lib/job-filters";

// Filters live behind one button in the toolbar, so the list stays calm: a
// popover on desktop, a bottom sheet on a phone. When something is filtered, a
// slim line of removable chips under the toolbar says what.

const CHANCE_DOT: Record<ChanceFilter, string | null> = {
  any: null,
  fair: "bg-amber-500",
  good: "bg-green-600",
  very_good: "bg-emerald-600",
};

// Same tints as the workplace tags on the job cards.
const WORKPLACE_ACTIVE: Record<Workplace, string> = {
  remote: "border-sky-400 bg-sky-100 text-sky-900",
  hybrid: "border-violet-400 bg-violet-100 text-violet-900",
  onsite: "border-slate-400 bg-slate-200 text-slate-900",
};

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#101828]/30";

/** How many filter groups narrow the list — the badge on the Filters button. */
function activeGroups(filters: Filters): number {
  return [
    filters.chance !== "any",
    filters.workplaces.length > 0,
    filters.status !== "all",
    filters.showHidden,
  ].filter(Boolean).length;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {title}
      </div>
      {children}
    </div>
  );
}

export function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      aria-label="Sort jobs by"
    >
      {(Object.keys(sortLabels) as SortKey[]).map((key) => (
        <option key={key} value={key}>
          {sortLabels[key]}
        </option>
      ))}
    </Select>
  );
}

export function FilterMenu({
  filters,
  onChange,
  onReset,
  chanceCounts,
  workplaceCounts,
  hiddenCount,
  shown,
}: {
  filters: Filters;
  onChange: (changes: Partial<Filters>) => void;
  onReset: () => void;
  chanceCounts: Record<ChanceFilter, number>;
  workplaceCounts: Record<Workplace, number>;
  hiddenCount: number;
  shown: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = activeGroups(filters);

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

  const toggleWorkplace = (w: Workplace) =>
    onChange({
      workplaces: filters.workplaces.includes(w)
        ? filters.workplaces.filter((x) => x !== w)
        : [...filters.workplaces, w],
    });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${buttonSecondary} w-full`}
      >
        <Funnel size={14} weight={active > 0 ? "fill" : "bold"} />
        Filters
        {active > 0 && (
          <span className="flex size-4.5 items-center justify-center rounded-full bg-[#101828] text-[10px] font-semibold text-white tabular-nums">
            {active}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Phone: a dimmed backdrop under a bottom sheet. */}
          <div
            className="fixed inset-0 z-40 bg-[#101828]/30 sm:hidden"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Filter jobs"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-12px_rgba(30,64,120,0.45)] sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-full sm:mt-2 sm:w-88 sm:rounded-2xl sm:p-4 sm:shadow-[0_16px_40px_-12px_rgba(30,64,120,0.45)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-[#1E2A3D]">Filters</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className={`${focusRing} flex size-8 items-center justify-center rounded-lg text-text-faint hover:bg-[#E4EEF5] hover:text-[#1E2A3D]`}
              >
                <X size={14} weight="bold" />
              </button>
            </div>

            <div className="space-y-5">
              <Section title="Chance">
                <div
                  role="radiogroup"
                  aria-label="Minimum chance"
                  className="grid grid-cols-4 rounded-xl border border-[#B9CCDA] bg-white p-0.5"
                >
                  {CHANCE_OPTIONS.map((option) => {
                    const selected = filters.chance === option;
                    const dot = CHANCE_DOT[option];
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange({ chance: option })}
                        className={`${focusRing} flex h-12 flex-col items-center justify-center gap-0.5 rounded-[10px] text-[12px] font-medium transition-colors ${
                          selected
                            ? "bg-[#101828] text-white"
                            : "text-text-muted hover:bg-[#E4EEF5]"
                        }`}
                      >
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          {dot && (
                            <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
                          )}
                          {chanceOptionLabels[option]}
                        </span>
                        <span
                          className={`text-[11px] tabular-nums ${selected ? "text-white/70" : "text-text-faint"}`}
                        >
                          {chanceCounts[option]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Workplace">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Workplace">
                  {WORKPLACES.map((w) => {
                    const selected = filters.workplaces.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleWorkplace(w)}
                        className={`${focusRing} inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                          selected
                            ? WORKPLACE_ACTIVE[w]
                            : "border-[#B9CCDA] bg-white text-[#1E2A3D] hover:border-[#8FA8BD] hover:bg-[#E4EEF5]"
                        }`}
                      >
                        {selected && <Check size={12} weight="bold" aria-hidden="true" />}
                        {workplaceLabels[w]}
                        <span
                          className={`text-[11px] tabular-nums ${selected ? "opacity-70" : "text-text-faint"}`}
                        >
                          {workplaceCounts[w]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Status">
                <Select
                  value={filters.status}
                  onChange={(e) => onChange({ status: e.target.value as StatusFilter })}
                  aria-label="Filter by status"
                >
                  {(Object.keys(statusFilterLabels) as StatusFilter[]).map((key) => (
                    <option key={key} value={key}>
                      {statusFilterLabels[key]}
                    </option>
                  ))}
                </Select>
              </Section>

              {(hiddenCount > 0 || filters.showHidden) && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={filters.showHidden}
                  onClick={() => onChange({ showHidden: !filters.showHidden })}
                  className={`${focusRing} flex w-full items-center justify-between rounded-lg text-[13px] text-[#1E2A3D]`}
                >
                  <span>
                    Show hidden jobs{" "}
                    <span className="tabular-nums text-text-faint">({hiddenCount})</span>
                  </span>
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      filters.showHidden ? "bg-[#101828]" : "bg-[#C3D3DF]"
                    }`}
                    aria-hidden="true"
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${
                        filters.showHidden ? "translate-x-4" : ""
                      }`}
                    />
                  </span>
                </button>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#D7E4ED] pt-4">
              <button
                type="button"
                onClick={onReset}
                disabled={active === 0}
                className={`${focusRing} rounded-md text-[13px] font-medium text-text-muted hover:text-[#1E2A3D] disabled:opacity-40`}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`${focusRing} inline-flex h-9 items-center rounded-xl bg-[#101828] px-4 text-[13px] font-medium text-white hover:bg-[#1E293B] active:scale-[0.98]`}
              >
                Show {shown} job{shown === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A slim line of what's filtered, each chip removable; nothing when nothing is. */
export function ActiveFilters({
  filters,
  onChange,
  onReset,
  shown,
  total,
}: {
  filters: Filters;
  onChange: (changes: Partial<Filters>) => void;
  onReset: () => void;
  shown: number;
  total: number;
}) {
  const chips: { label: string; remove: () => void }[] = [];
  if (filters.chance !== "any") {
    chips.push({
      label: chanceOptionLabels[filters.chance],
      remove: () => onChange({ chance: "any" }),
    });
  }
  for (const w of filters.workplaces) {
    chips.push({
      label: workplaceLabels[w],
      remove: () => onChange({ workplaces: filters.workplaces.filter((x) => x !== w) }),
    });
  }
  if (filters.status !== "all") {
    chips.push({
      label: statusFilterLabels[filters.status],
      remove: () => onChange({ status: "all" }),
    });
  }
  if (filters.showHidden) {
    chips.push({ label: "Hidden shown", remove: () => onChange({ showHidden: false }) });
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[#D7E4ED] px-4 py-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.remove}
          aria-label={`Remove filter ${chip.label}`}
          className={`${focusRing} inline-flex h-6 items-center gap-1 rounded-full bg-[#E4EEF5] pr-1.5 pl-2.5 text-[12px] font-medium text-[#1E2A3D] hover:bg-[#D3E3EE]`}
        >
          {chip.label}
          <X size={10} weight="bold" className="text-text-faint" />
        </button>
      ))}
      <span className="ml-1 text-[12px] tabular-nums text-text-faint" aria-live="polite">
        {shown} of {total} jobs
      </span>
      <button
        type="button"
        onClick={onReset}
        className={`${focusRing} ml-auto rounded-md text-[12px] font-medium text-text-muted hover:text-[#1E2A3D]`}
      >
        Clear all
      </button>
    </div>
  );
}
