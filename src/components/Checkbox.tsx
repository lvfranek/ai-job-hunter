"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-text">
      <span className="relative inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer sr-only"
        />
        <span
          className={`flex size-4 items-center justify-center rounded-[5px] border transition-colors ${
            checked
              ? "border-[#101828] bg-[#101828] text-white"
              : "border-border-strong bg-surface peer-focus-visible:ring-2 peer-focus-visible:ring-[#101828]/30"
          }`}
        >
          {checked && <Check size={11} weight="bold" />}
        </span>
      </span>
      <span className="capitalize">{label}</span>
    </label>
  );
}
