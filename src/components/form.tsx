import type { ReactNode } from "react";
import { Check, CircleNotch, Info } from "@phosphor-icons/react/dist/ssr";

// Building blocks for the settings-style pages (Scoring Preferences, Scraping
// Settings, Cover Letter Profile): a page header, section cards with the
// section's title/description on the left and its fields on the right, labelled
// fields, and a sticky save bar.

export const textInputClass =
  "h-9 w-full rounded-xl border border-[#B9CCDA] bg-white px-3 text-[13px] text-[#1E2A3D] outline-none transition-colors placeholder:text-text-faint hover:border-[#8FA8BD] focus:border-[#101828] focus-visible:ring-2 focus-visible:ring-[#101828]/20";

export const textareaClass =
  "w-full resize-y rounded-xl border border-[#B9CCDA] bg-white px-3 py-2.5 text-[13px] leading-relaxed text-[#1E2A3D] outline-none transition-colors placeholder:text-text-faint hover:border-[#8FA8BD] focus:border-[#101828] focus-visible:ring-2 focus-visible:ring-[#101828]/20";

export const labelClass = "mb-1.5 block text-[13px] font-medium text-[#1E2A3D]";

const hintClass = "mt-1.5 space-y-1 text-[12px] leading-relaxed text-text-faint";

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
      {description && <p className="mt-1 text-[13px] text-text-faint">{description}</p>}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-rose-300 bg-rose-100 px-3.5 py-2.5 text-[13px] text-rose-800">
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-5 shadow-[0_16px_40px_-18px_rgba(30,64,120,0.35)] sm:p-6 lg:grid lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10">
      <div className="mb-5 lg:mb-0">
        <h2 className="text-[15px] font-semibold text-[#1E2A3D]">{title}</h2>
        {description && (
          <div className="mt-1 space-y-2 text-[12px] leading-relaxed text-text-faint">
            {description}
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <div className={hintClass}>{hint}</div>}
    </div>
  );
}

/** A group of related controls (checkboxes, several inputs) under one legend. */
export function FieldGroup({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}</legend>
      {children}
      {hint && <div className={hintClass}>{hint}</div>}
    </fieldset>
  );
}

export function CheckboxRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">{children}</div>;
}

/** What a page passes as `savedMessage` when the demo API accepted a save as a no-op. */
export const DEMO_SAVE_MESSAGE = "Demo mode — changes aren't stored";

/**
 * A small dark pill floating at the bottom of the content area. It only shows
 * while there is something to act on (unsaved changes, a save in flight, an
 * error) or to confirm a save that just finished, so it never sits over the
 * page for nothing. Render it once, at the end of the page: the spacer it
 * leaves lets the last content scroll clear of it.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  label,
  error,
  savedMessage,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  label: string;
  /** Shown in the bar too, since the page's error banner may be scrolled out of view. */
  error?: string | null;
  /** Confirmation after a successful save, e.g. "Settings saved"; the page clears it after a few seconds. */
  savedMessage?: string | null;
}) {
  const state = error ? "error" : saving ? "saving" : dirty ? "dirty" : "saved";
  const visible = state !== "saved" || Boolean(savedMessage);

  return (
    <>
      {visible && <div className="h-16" aria-hidden="true" />}
      <div
        className={`fixed inset-x-4 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-2xl bg-[#101828] py-1.5 pl-4 text-white shadow-[0_16px_36px_-10px_rgba(16,24,40,0.55)] transition-all duration-200 sm:right-4 sm:left-22 sm:max-w-[calc(100%-7.5rem)] ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        } ${state === "saved" || state === "saving" ? "min-h-11 pr-4" : "pr-1.5"}`}
        aria-hidden={!visible}
      >
        <p
          className={`flex min-w-0 items-center gap-2 text-[13px] ${
            state === "error" ? "text-rose-200" : state === "dirty" ? "text-white/80" : "text-white"
          }`}
          role="status"
          aria-live="polite"
        >
          {state === "saving" ? (
            <CircleNotch size={14} weight="bold" className="shrink-0 animate-spin" />
          ) : state === "saved" && savedMessage === DEMO_SAVE_MESSAGE ? (
            <Info size={16} weight="fill" className="shrink-0 text-white/70" />
          ) : state === "saved" ? (
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[#101828]">
              <Check size={10} weight="bold" />
            </span>
          ) : (
            <span
              className={`size-2 shrink-0 rounded-full ${
                state === "error" ? "bg-rose-400" : "bg-amber-400"
              }`}
              aria-hidden="true"
            />
          )}
          <span className="min-w-0">
            {state === "error"
              ? error
              : state === "saving"
                ? "Saving…"
                : state === "dirty"
                  ? "Unsaved changes"
                  : (savedMessage ?? "Saved")}
          </span>
        </p>
        {(state === "dirty" || state === "error") && (
          <button
            type="button"
            onClick={onSave}
            disabled={!visible}
            tabIndex={visible ? 0 : -1}
            className="inline-flex h-8 shrink-0 items-center rounded-xl bg-white px-3 text-[13px] font-medium text-[#101828] outline-none transition-colors hover:bg-[#E4EEF5] focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98] disabled:opacity-60"
          >
            {label}
          </button>
        )}
      </div>
    </>
  );
}
