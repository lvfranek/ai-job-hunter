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
  { href: "/preferences", label: "AI Scoring Preferences", icon: Target },
  { href: "/settings", label: "Scraping Settings", icon: GearSix },
  { href: "/profile", label: "Cover Letter Profile", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dirty, setDirty } = useUnsavedChanges();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  if (pathname === "/login") return null;

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
    <aside className="sticky top-0 flex h-screen w-22 shrink-0 items-stretch bg-[#DFE9F0] p-4">
      <div className="flex w-full flex-col items-center gap-6 rounded-[28px] border border-white/60 bg-[#F1FAFF] py-4 shadow-[0_8px_30px_-10px_rgba(30,64,120,0.28)]">
        <Link
          href="/"
          onClick={(e) => guardNav(e, "/")}
          title="AI Job Hunter"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-b from-white to-[#F3F9FD] text-[#1E2A3D] shadow-[0_2px_8px_rgba(30,64,120,0.15)] outline-none focus-visible:ring-2 focus-visible:ring-[#101828]/30"
        >
          <Lightning size={18} weight="fill" />
        </Link>

        <nav className="flex flex-col items-center gap-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => guardNav(e, href)}
                aria-current={active ? "page" : undefined}
                title={label}
                className={`flex size-11 shrink-0 items-center justify-center rounded-2xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#101828]/30 ${
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
      </div>

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
