"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

/** Dialog shell for the tracker's add/edit and import dialogs; Escape closes it. */
export function Modal({
  title,
  description,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full flex-col rounded-2xl border border-white bg-linear-to-b from-white to-[#F7FBFD] p-5 shadow-[0_20px_50px_-20px_rgba(30,64,120,0.4)] ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1E2A3D]">{title}</h2>
            {description && <p className="mt-1 text-[13px] text-text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-faint hover:text-[#1E2A3D]"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
