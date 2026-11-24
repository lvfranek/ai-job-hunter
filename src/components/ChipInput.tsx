"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

/**
 * A list edited as chips: type and press Enter (or a comma) to add one, × or
 * Backspace on the empty input to remove. Duplicates are ignored, case-blind.
 * `soft` gives a quieter look, for a list that weighs less than its neighbour.
 */
export function ChipInput({
  id,
  values,
  onChange,
  placeholder,
  soft = false,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  soft?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const chip = draft.replace(/,$/, "").trim();
    setDraft("");
    if (!chip || values.some((v) => v.toLowerCase() === chip.toLowerCase())) return;
    onChange([...values, chip]);
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) document.getElementById(id)?.focus();
      }}
      className="flex min-h-10 cursor-text flex-wrap gap-1.5 rounded-xl border border-border-strong bg-surface p-1.5 transition-colors hover:border-border-hover focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"
    >
      {values.map((value) => (
        <span
          key={value}
          className={`inline-flex h-7 items-center gap-1 rounded-[9px] pr-1 pl-2.5 text-[12.5px] font-medium ${
            soft
              ? "border border-dashed border-border-strong bg-surface-2 text-text-muted"
              : "bg-surface-hover text-text"
          }`}
        >
          {value}
          <button
            type="button"
            onClick={() => onChange(values.filter((v) => v !== value))}
            aria-label={`Remove ${value}`}
            className="inline-flex size-5 items-center justify-center rounded-md text-text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-black/60"
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="h-7 min-w-28 flex-1 bg-transparent px-1.5 text-[13px] text-text outline-none placeholder:text-text-faint"
      />
    </div>
  );
}
