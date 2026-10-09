"use client";

import { useRef, useState } from "react";
import { Plus, X } from "@phosphor-icons/react/dist/ssr";
import { buttonSecondary, iconButton } from "@/components/controls";
import { textInputClass } from "@/components/form";
import { DEFAULT_RADIUS_KM, MAX_WORK_LOCATIONS } from "@/lib/preferences";

/** One commute city as edited; the radius stays text so the field can be cleared while typing. */
export interface LocationRow {
  place: string;
  radius: string;
}

export const emptyLocationRow = (): LocationRow => ({
  place: "",
  radius: String(DEFAULT_RADIUS_KM),
});

const OPTIONS_ID = "work-location-options";
// The shared input style is full width; the radius field is a fixed narrow one.
const narrowInputClass = textInputClass.replace("w-full ", "");
const SUGGEST_DELAY_MS = 200;

/**
 * The cities a candidate would commute to, each with its own radius.
 * Suggestions come from /api/places while typing; on leaving a field the name
 * is checked and replaced by its proper form ("hamburg" → "Hamburg",
 * "Vienna" → "Wien (AT)"), or marked as not found.
 */
export function WorkLocationsField({
  rows,
  onChange,
}: {
  rows: LocationRow[];
  onChange: (rows: LocationRow[]) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Keyed by the place text, so it survives rows being removed or reordered.
  const [notFound, setNotFound] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AbortController | null>(null);

  const update = (i: number, change: Partial<LocationRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...change } : row)));

  function suggest(query: string) {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) return setSuggestions([]);
    timer.current = setTimeout(async () => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setSuggestions(Array.isArray(data.places) ? data.places : []);
      } catch {
        // Aborted by the next keystroke, or offline — keep the old suggestions.
      }
    }, SUGGEST_DELAY_MS);
  }

  async function check(i: number, place: string) {
    const typed = place.trim();
    if (!typed) return;
    try {
      const res = await fetch(`/api/places?q=${encodeURIComponent(typed)}&exact=1`);
      const data = await res.json();
      const match = typeof data.match === "string" ? data.match : null;
      setNotFound((current) => {
        const next = new Set(current);
        if (match) next.delete(typed);
        else next.add(typed);
        return next;
      });
      if (match && match !== place) update(i, { place: match });
    } catch {
      // The save checks again on the server.
    }
  }

  return (
    <div className="space-y-2.5">
      <datalist id={OPTIONS_ID}>
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={row.place}
            onChange={(e) => {
              update(i, { place: e.target.value });
              suggest(e.target.value);
            }}
            onBlur={(e) => check(i, e.target.value)}
            list={OPTIONS_ID}
            autoComplete="off"
            aria-label={`City ${i + 1}`}
            placeholder="City or postcode, e.g. Hamburg"
            className={`${textInputClass} min-w-0 flex-1 basis-full sm:basis-48`}
          />
          {/* Kept together, so a phone wraps the whole "within 25 km ✕" below the city. */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-text-muted">within</span>
            <input
              value={row.radius}
              onChange={(e) => update(i, { radius: e.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              aria-label={`Distance around city ${i + 1} in km`}
              className={`${narrowInputClass} w-16 text-right`}
            />
            <span className="text-[13px] text-text-muted">km</span>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              aria-label={`Remove ${row.place.trim() || `city ${i + 1}`}`}
              className={iconButton}
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          {notFound.has(row.place.trim()) && (
            <p className="basis-full text-[12px] text-rose-800">
              Not found — try the city&apos;s name or its postcode.
            </p>
          )}
        </div>
      ))}

      {rows.length < MAX_WORK_LOCATIONS && (
        <button
          type="button"
          onClick={() => onChange([...rows, emptyLocationRow()])}
          className={buttonSecondary}
        >
          <Plus size={14} weight="bold" />
          {rows.length === 0 ? "Add a city" : "Add another city"}
        </button>
      )}
    </div>
  );
}
