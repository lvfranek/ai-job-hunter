"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

export function TagInput({
  label,
  helperText,
  tags,
  onChange,
}: {
  label: string;
  helperText?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function addTag() {
    const value = input.trim();
    if (value && !tags.includes(value)) onChange([...tags, value]);
    setInput("");
  }

  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-text-muted">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 py-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md border border-border-strong bg-surface-hover px-2 py-1 text-[12px] text-text"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-text-faint hover:text-text"
              aria-label={`Remove ${tag}`}
            >
              <X size={11} weight="bold" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            } else if (e.key === "Backspace" && !input && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={addTag}
          placeholder="Type and press Enter"
          className="min-w-35 flex-1 bg-transparent py-1 text-[13px] text-text outline-none placeholder:text-text-faint"
        />
      </div>
      {helperText && <p className="mt-1.5 text-[12px] text-text-faint">{helperText}</p>}
    </div>
  );
}
