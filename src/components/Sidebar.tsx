import Link from "next/link";
import {
  GearSix,
  Lightning,
  SquaresFour,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { AgentStatus } from "@/components/AgentStatus";
import { mockAgentStatus } from "@/lib/mock-data";

const navItems = [
  { href: "/", label: "Dashboard", icon: SquaresFour, active: true },
  { href: "/settings", label: "Settings", icon: GearSix, active: false },
  { href: "/profile", label: "Profile", icon: UserCircle, active: false },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border px-3 py-4">
      <Link
        href="/"
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
        {navItems.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 ${
              active
                ? "bg-white/10 text-text"
                : "text-text-muted hover:bg-white/5 hover:text-text"
            }`}
          >
            <Icon size={16} weight={active ? "fill" : "regular"} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto">
        <div className="panel rounded-xl px-3 py-3">
          <AgentStatus status={mockAgentStatus} />
        </div>
      </div>
    </aside>
  );
}
