"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import type { Language } from "@/lib/types";
import { labelClass, textInputClass } from "@/components/form";

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
      <p className={labelClass}>Languages</p>
      <div className="space-y-1.5">
        {languages.map((lang) => (
          <div
            key={lang.name}
            className="flex min-h-9 flex-wrap items-center gap-2 rounded-xl border border-[#B9CCDA] bg-white py-1 pr-2 pl-3"
          >
            <span className="flex-1 text-[13px] text-text">{lang.name}</span>
            <select
              value={lang.level}
              onChange={(e) =>
                onChange(
                  languages.map((l) =>
                    l.name === lang.name ? { ...l, level: e.target.value } : l,
                  ),
                )
              }
              aria-label={`${lang.name} proficiency level`}
              className="h-7 rounded-lg border border-[#D7E4ED] bg-[#EEF4F9] px-2 text-[12px] text-[#1E2A3D] capitalize outline-none focus:border-[#101828]"
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
          aria-label="Add a language"
          className={textInputClass}
        />
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">
        Add a language, then set how comfortable you are working in it
      </p>
    </div>
  );
}
