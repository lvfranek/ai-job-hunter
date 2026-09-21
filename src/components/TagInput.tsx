"use client";

import { useId, useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { labelClass } from "@/components/form";

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
  const inputId = useId();

  function addTag() {
    const value = input.trim();
    if (value && !tags.includes(value)) onChange([...tags, value]);
    setInput("");
  }

  return (
    <div>
      <label htmlFor={inputId} className={labelClass}>
        {label}
      </label>
      <div className="flex min-h-9 flex-wrap gap-1.5 rounded-xl border border-[#B9CCDA] bg-white px-2 py-1.5 transition-colors focus-within:border-[#101828] hover:border-[#8FA8BD]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-lg border border-[#D7E4ED] bg-[#EEF4F9] px-2 py-0.5 text-[12px] text-[#1E2A3D]"
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
          id={inputId}
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
          className="min-w-35 flex-1 bg-transparent px-1 py-0.5 text-[13px] text-text outline-none placeholder:text-text-faint"
        />
      </div>
      {helperText && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">{helperText}</p>
      )}
    </div>
  );
}
