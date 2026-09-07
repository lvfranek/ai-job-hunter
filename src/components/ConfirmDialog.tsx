"use client";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Stay",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200"
      : "border-[#101828] bg-[#101828] text-white hover:bg-[#1E293B]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-surface p-5">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        <p className="mt-1.5 text-[13px] text-text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-strong bg-surface px-3.5 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-surface-hover active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition-colors active:scale-[0.98] ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
