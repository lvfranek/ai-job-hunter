"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Briefcase,
  ChartBar,
  FileText,
  Globe,
  Lightning,
  SignOut,
  SlidersHorizontal,
  SquaresFour,
} from "@phosphor-icons/react/dist/ssr";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const navItems = [
  { href: "/", label: "Dashboard", icon: SquaresFour },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/stats", label: "Statistics", icon: ChartBar },
  { href: "/preferences", label: "AI Scoring Preferences", icon: SlidersHorizontal },
  { href: "/settings", label: "Scraping Settings", icon: Globe },
  { href: "/profile", label: "Cover Letter Profile", icon: FileText },
];

// Every control in the bar: 40px square on desktop; on a phone it shares the
// row (flex-1, at most 40px wide) so the whole bar fits any screen width.
const controlSize =
  "group relative flex h-10 max-w-10 min-w-0 flex-1 basis-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:size-10 sm:max-w-none sm:flex-none";

// Icons are grey and light; hover brightens and nudges them up in size.
const iconMotion = "transition-transform duration-150 group-hover:scale-110";

// Stand-in "destination" for the unsaved-changes dialog when leaving via logout.
const LOGOUT = "logout";

const tooltipAlign = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

/**
 * The name of an icon-only sidebar control, shown on hover or keyboard focus:
 * right of the vertical desktop bar, below the horizontal mobile one. `align`
 * keeps the first and last items' labels on screen in the mobile bar. Tailwind
 * only applies hover on devices that can hover, so a tap on a phone won't flash it.
 */
function NavTooltip({
  label,
  align = "center",
}: {
  label: string;
  align?: keyof typeof tooltipAlign;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-full z-50 mt-2 rounded-lg border border-border-strong bg-popover px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-text opacity-0 transition-[opacity,translate] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 sm:top-1/2 sm:right-auto sm:left-full sm:mt-0 sm:ml-3 sm:-translate-x-1 sm:-translate-y-1/2 sm:group-hover:translate-x-0 sm:group-focus-visible:translate-x-0 ${tooltipAlign[align]}`}
    >
      {label}
    </span>
  );
}

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
    <aside className="sticky top-0 z-40 flex w-full shrink-0 border-b border-border bg-bg px-3 py-2 sm:top-(--banner-h) sm:h-[calc(100dvh-var(--banner-h))] sm:w-15 sm:flex-col sm:items-center sm:border-r sm:border-b-0 sm:px-0 sm:py-4">
      {/* Mobile: one row across the top, each control shrinking to fit.
          Desktop: logo on top, the pages in the middle, logout at the bottom. */}
      <Link
        href="/"
        onClick={(e) => guardNav(e, "/")}
        aria-label="AI Job Hunter — go to dashboard"
        className={`${controlSize} sm:size-8! sm:rounded-[9px] bg-primary text-on-primary transition-colors hover:bg-primary-hover`}
      >
        <Lightning size={17} weight="fill" />
        <NavTooltip label="AI Job Hunter" align="start" />
      </Link>

      <nav
        aria-label="Main"
        className="flex min-w-0 flex-[6_1_0%] items-center justify-center gap-1 sm:my-auto sm:flex-none sm:flex-col sm:gap-3.5"
      >
        {navItems.map(({ href, label, icon: Icon }, i) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => guardNav(e, href)}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={`${controlSize} transition-colors ${
                active
                  ? "text-primary after:absolute after:-bottom-2 after:left-2 after:right-2 after:h-0.5 after:bg-primary sm:after:top-1 sm:after:bottom-1 sm:after:left-auto sm:after:-right-2.5 sm:after:h-auto sm:after:w-0.5"
                  : "text-text-faint hover:text-text"
              }`}
            >
              <Icon size={21} weight="light" className={iconMotion} />
              {/* The last item sits near the right edge of a phone. */}
              <NavTooltip label={label} align={i === navItems.length - 1 ? "end" : "center"} />
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={requestLogout}
        disabled={loggingOut}
        aria-label="Log out"
        className={`${controlSize} text-text-faint transition-colors hover:text-text disabled:opacity-50`}
      >
        <SignOut size={21} weight="light" className={iconMotion} />
        <NavTooltip label="Log out" align="end" />
      </button>

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
