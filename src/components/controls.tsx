import type { ComponentProps, ReactNode } from "react";
import { CaretDown, Check } from "@phosphor-icons/react/dist/ssr";

// One size, radius and type style for every button, select and input in the
// job matches panel, so the toolbar and the job rows read as one system.
// Padding and focus-ring color live in the variants, never in the shared base,
// so no two classes fight over the same property.
const controlBase = "outline-none transition-colors focus-visible:ring-2 disabled:opacity-50";
const control = `h-9 rounded-xl text-[13px] ${controlBase}`;
// The job list's rows are thin, so their controls are too.
const controlSmall = `h-7 rounded-lg text-[12px] ${controlBase}`;

const button = `${control} inline-flex shrink-0 items-center justify-center gap-1.5 font-medium active:scale-[0.98]`;

const secondaryColors =
  "border border-border-strong bg-surface text-text hover:border-border-hover hover:bg-surface-hover focus-visible:ring-primary/20 disabled:hover:border-border-strong disabled:hover:bg-surface";

export const buttonPrimary = `${button} px-3 bg-primary text-on-primary hover:bg-primary-hover focus-visible:ring-black/60`;

export const buttonSecondary = `${button} px-3 ${secondaryColors}`;

export const buttonDanger = `${button} px-3 border border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200 focus-visible:ring-rose-400/40`;

export const iconButton = `${button} w-9 ${secondaryColors}`;

export const inputClass = `${control} border border-border-strong bg-surface px-2.5 text-text hover:border-border-hover focus:border-primary focus-visible:ring-primary/20`;

const selectColors = "border-border-strong bg-surface text-text hover:border-border-hover";

/** A list row's icon action: a link can use these classes plus a {@link RowTooltip}. */
export const rowActionClass =
  "group relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint outline-none transition-colors hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary/40";

/** A small icon-only action for a list row, named by a tooltip on hover or focus. */
export function RowAction({
  label,
  className = "",
  children,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className={`${rowActionClass} ${className}`}
    >
      {children}
      <RowTooltip label={label} />
    </button>
  );
}

/** The hover label of a {@link RowAction}, or of a link styled like one. */
export function RowTooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 translate-y-0.5 rounded-md border border-border-strong bg-popover px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-text opacity-0 transition-[opacity,translate] duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

export function Select({
  small = false,
  className = "",
  colorClassName = selectColors,
  caretClassName = "text-text-faint",
  children,
  ...props
}: ComponentProps<"select"> & {
  /** The thin version, for list rows. */
  small?: boolean;
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
        className={`${small ? controlSmall : control} w-full cursor-pointer appearance-none border pr-6 pl-2.5 font-normal focus-visible:ring-primary/20 sm:pr-8 sm:pl-3 focus:border-primary ${colorClassName}`}
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

/** An on/off switch with its label, the whole row clickable. */
export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
      <span className="flex items-center gap-1 text-[13px] font-medium text-text">{children}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/60 ${
          checked ? "bg-primary" : "bg-border-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

/** One option of a pick-several list, pressed when chosen. */
export function ToggleChip({
  pressed,
  onChange,
  disabled = false,
  children,
}: {
  pressed: boolean;
  onChange: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onChange}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/60 disabled:cursor-default ${
        pressed
          ? "border-primary bg-primary text-on-primary"
          : "border-border-strong bg-surface text-text hover:border-border-hover"
      } ${disabled ? "opacity-85" : ""}`}
    >
      {pressed && <Check size={12} weight="bold" />}
      {children}
    </button>
  );
}
