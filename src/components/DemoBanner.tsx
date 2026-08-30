"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function DemoBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  if (pathname === "/login") return null;

  async function exitDemo() {
    setExiting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — we're leaving the page regardless
    }
    router.push("/login");
    router.refresh(); // re-run the server layout so the banner drops
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-amber-300 bg-amber-100 px-4 py-2 text-[12px] text-amber-800">
      <p className="min-w-0">
        <span className="font-semibold">Demo mode</span> — you&apos;re viewing sample data. Job
        scraping, AI match scoring and cover-letter generation are simulated: no real scraping and
        no AI or paid API calls are made.
      </p>
      <button
        type="button"
        onClick={exitDemo}
        disabled={exiting}
        className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 font-medium text-amber-900 transition-colors hover:bg-amber-200 active:scale-[0.98] disabled:opacity-50"
      >
        {exiting ? "Exiting…" : "Exit demo"}
      </button>
    </div>
  );
}
