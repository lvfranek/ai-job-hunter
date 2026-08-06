"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import type { Language } from "@/lib/types";

const LEVELS = ["basic", "conversational", "fluent", "native"];

export function LanguageInput({
  languages,
  onChange,
}: {
  languages: Language[];
  onChange: (languages: Language[]) => void;
}) {
  const [input, setInput] = useState("");

  function addLanguage() {
    const value = input.trim();
    if (value && !languages.some((l) => l.name === value)) {
      onChange([...languages, { name: value, level: "fluent" }]);
    }
    setInput("");
  }

  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-text-muted">Languages</label>
      <div className="space-y-1.5">
        {languages.map((lang) => (
          <div
            key={lang.name}
            className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5"
          >
            <span className="flex-1 text-[13px] text-text">{lang.name}</span>
            <select
              value={lang.level}
              onChange={(e) =>
                onChange(
                  languages.map((l) =>
                    l.name === lang.name ? { ...l, level: e.target.value } : l
                  )
                )
              }
              className="rounded-md border border-border-strong bg-surface-hover px-2 py-1 text-[12px] text-text capitalize outline-none focus:border-text-muted"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level} className="capitalize">
                  {level}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange(languages.filter((l) => l.name !== lang.name))}
              className="text-text-faint hover:text-text"
              aria-label={`Remove ${lang.name}`}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addLanguage();
            }
          }}
          onBlur={addLanguage}
          placeholder="Type a language and press Enter"
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none placeholder:text-text-faint focus:border-text-muted"
        />
      </div>
      <p className="mt-1.5 text-[12px] text-text-faint">
        Add a language, then set how comfortable you are working in it
      </p>
    </div>
  );
}
