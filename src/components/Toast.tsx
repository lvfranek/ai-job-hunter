"use client";

export function Toast({
  message,
  action,
}: {
  message: string | null;
  /** An optional button next to the message, e.g. Undo. The caller owns the timer. */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="pointer-events-none fixed top-6 right-4 z-50 sm:right-8"
      role="status"
      aria-live="polite"
    >
      {message && (
        <span className="pointer-events-auto flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-1.5 text-[13px] text-emerald-800 shadow-lg backdrop-blur-sm">
          <span>{message}</span>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="rounded-md px-1.5 py-0.5 font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-600/40"
            >
              {action.label}
            </button>
          )}
        </span>
      )}
    </div>
  );
}
