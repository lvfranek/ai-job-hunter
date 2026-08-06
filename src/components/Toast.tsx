"use client";

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed top-6 right-8 z-50">
      <span className="pointer-events-auto rounded-lg border border-score-high/30 bg-score-high/15 px-3 py-1.5 text-[13px] text-score-high shadow-lg backdrop-blur-sm">
        {message}
      </span>
    </div>
  );
}
