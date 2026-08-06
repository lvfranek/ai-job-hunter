"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  GearSix,
  Lightning,
  SquaresFour,
  Target,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const navItems = [
  { href: "/", label: "Dashboard", icon: SquaresFour },
  { href: "/profile", label: "Profile", icon: UserCircle },
  { href: "/preferences", label: "Preferences", icon: Target },
  { href: "/settings", label: "Settings", icon: GearSix },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dirty, setDirty } = useUnsavedChanges();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  function guardNav(e: React.MouseEvent, href: string) {
    if (dirty) {
      e.preventDefault();
      setPendingHref(href);
    }
  }

  function confirmLeave() {
    setDirty(false);
    if (pendingHref) router.push(pendingHref);
    setPendingHref(null);
  }

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border px-3 py-4">
      <Link
        href="/"
        onClick={(e) => guardNav(e, "/")}
        className="flex items-center gap-2 rounded-lg px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-text">
          <Lightning size={16} weight="fill" />
        </span>
        <span className="truncate text-[14px] font-semibold tracking-tight text-text">
          AI Job Hunter
        </span>
      </Link>

      <nav className="mt-6 flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={(e) => guardNav(e, href)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 ${
                active
                  ? "panel text-text"
                  : "border border-transparent text-text-muted hover:border-border-strong hover:bg-surface-hover hover:text-text"
              }`}
            >
              <Icon size={16} weight={active ? "fill" : "regular"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <ConfirmDialog
        open={pendingHref !== null}
        title="Unsaved changes"
        message="You have unsaved changes. Leave without saving?"
        confirmLabel="Leave without saving"
        onConfirm={confirmLeave}
        onCancel={() => setPendingHref(null)}
      />
    </aside>
  );
}
