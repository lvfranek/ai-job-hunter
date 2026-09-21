import type { ComponentProps } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

// One size, radius and type style for every button, select and input in the
// job matches panel, so the toolbar and the job rows read as one system.
// Padding and focus-ring color live in the variants, never in the shared base,
// so no two classes fight over the same property.
const control =
  "h-9 rounded-xl text-[13px] outline-none transition-colors focus-visible:ring-2 disabled:opacity-50";

const button = `${control} inline-flex shrink-0 items-center justify-center gap-1.5 font-medium active:scale-[0.98]`;

const secondaryColors =
  "border border-[#B9CCDA] bg-white text-[#1E2A3D] shadow-[0_1px_2px_rgba(30,64,120,0.06)] hover:border-[#8FA8BD] hover:bg-[#E4EEF5] focus-visible:ring-[#101828]/20 disabled:hover:border-[#B9CCDA] disabled:hover:bg-white";

export const buttonPrimary = `${button} px-3 bg-[#101828] text-white hover:bg-[#1E293B] focus-visible:ring-[#101828]/30`;

export const buttonSecondary = `${button} px-3 ${secondaryColors}`;

export const buttonDanger = `${button} px-3 border border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200 focus-visible:ring-rose-400/40`;

export const iconButton = `${button} w-9 ${secondaryColors}`;

export const inputClass = `${control} border border-[#B9CCDA] bg-white px-2.5 text-[#1E2A3D] hover:border-[#8FA8BD] focus:border-[#101828] focus-visible:ring-[#101828]/20`;

const selectColors = "border-[#B9CCDA] bg-white text-[#1E2A3D] hover:border-[#8FA8BD]";

export function Select({
  className = "",
  colorClassName = selectColors,
  caretClassName = "text-text-faint",
  children,
  ...props
}: ComponentProps<"select"> & {
  /** Classes for the wrapper — use for width. */
  className?: string;
  /** Replaces the default border/background/text colors (e.g. status tints). */
  colorClassName?: string;
  caretClassName?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        className={`${control} w-full cursor-pointer appearance-none border pr-6 pl-2.5 font-normal focus-visible:ring-[#101828]/20 sm:pr-8 sm:pl-3 focus:border-[#101828] ${colorClassName}`}
      >
        {children}
      </select>
      <CaretDown
        size={12}
        weight="bold"
        className={`pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 sm:right-3 ${caretClassName}`}
      />
    </div>
  );
}
