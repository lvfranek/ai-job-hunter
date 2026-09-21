"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  GearSix,
  Lightning,
  SignOut,
  SquaresFour,
  Target,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const navItems = [
  { href: "/", label: "Dashboard", icon: SquaresFour },
  { href: "/preferences", label: "AI Scoring Preferences", icon: Target },
  { href: "/settings", label: "Scraping Settings", icon: GearSix },
  { href: "/profile", label: "Cover Letter Profile", icon: UserCircle },
];

// Stand-in "destination" for the unsaved-changes dialog when leaving via logout.
const LOGOUT = "logout";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dirty, setDirty } = useUnsavedChanges();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  if (pathname === "/login") return null;

  function guardNav(e: React.MouseEvent, href: string) {
    if (dirty) {
      e.preventDefault();
      setPendingHref(href);
    }
  }

  function confirmLeave() {
    setDirty(false);
    if (pendingHref === LOGOUT) logout();
    else if (pendingHref) router.push(pendingHref);
    setPendingHref(null);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      // Clears the session cookie and, for guests, the demo cookies.
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — we're leaving for the login page regardless
    }
    router.push("/login");
    router.refresh(); // re-run the server layout so the demo banner drops
    // The sidebar lives in the root layout and stays mounted across logins, so
    // reset this or the button stays disabled after the next login.
    setLoggingOut(false);
  }

  function requestLogout() {
    if (dirty) setPendingHref(LOGOUT);
    else logout();
  }

  return (
    <aside className="pointer-events-none sticky top-0 z-40 flex w-full shrink-0 px-4 py-3 sm:pointer-events-auto sm:top-(--banner-h) sm:z-auto sm:h-[calc(100dvh-var(--banner-h))] sm:w-22 sm:items-stretch sm:p-4">
      <div className="pointer-events-auto flex w-full items-center gap-2 max-[360px]:gap-1 rounded-[22px] border border-white/60 bg-[#F1FAFF] p-1.5 shadow-[0_8px_30px_-10px_rgba(30,64,120,0.28)] sm:flex-col sm:px-0">
        <Link
          href="/"
          onClick={(e) => guardNav(e, "/")}
          title="AI Job Hunter"
          aria-label="AI Job Hunter — go to dashboard"
          className="flex size-11 shrink-0 max-[360px]:size-10 items-center justify-center rounded-2xl bg-linear-to-b from-white to-[#F3F9FD] text-[#1E2A3D] shadow-[0_2px_8px_rgba(30,64,120,0.15)] outline-none focus-visible:ring-2 focus-visible:ring-[#101828]/30"
        >
          <Lightning size={18} weight="fill" />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-2 max-[360px]:gap-1 sm:flex-col">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => guardNav(e, href)}
                aria-current={active ? "page" : undefined}
                title={label}
                aria-label={label}
                className={`flex size-11 shrink-0 max-[360px]:size-10 items-center justify-center rounded-2xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#101828]/30 ${
                  active
                    ? "bg-[#101828] text-white shadow-[0_4px_14px_rgba(16,24,40,0.35)]"
                    : "text-[#5B6B7F] hover:bg-[#C9DFEC] hover:text-[#101828]"
                }`}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} />
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={requestLogout}
          disabled={loggingOut}
          title="Log out"
          aria-label="Log out"
          className="ml-auto flex size-11 shrink-0 max-[360px]:size-10 items-center justify-center rounded-2xl text-[#5B6B7F] outline-none transition-colors hover:bg-[#C9DFEC] hover:text-[#101828] focus-visible:ring-2 focus-visible:ring-[#101828]/30 disabled:opacity-50 sm:mt-auto sm:ml-0"
        >
          <SignOut size={18} />
        </button>
      </div>

      <ConfirmDialog
        open={pendingHref !== null}
        title="Unsaved changes"
        message="You have unsaved changes. Leave without saving?"
        confirmLabel={pendingHref === LOGOUT ? "Log out without saving" : "Leave without saving"}
        onConfirm={confirmLeave}
        onCancel={() => setPendingHref(null)}
      />
    </aside>
  );
}
