import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import type { AgentStatusData } from "@/lib/mock-data";

export function AgentStatus({ status }: { status: AgentStatusData }) {
  const isActive = status.state !== "idle";

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
          isActive ? "bg-white/10 text-text" : "bg-white/5 text-text-faint"
        }`}
      >
        <CircleNotch size={12} weight="bold" className={isActive ? "animate-spin" : ""} />
      </span>
      <div className="min-w-0 text-[12px] leading-snug text-text-muted">
        {isActive ? (
          <>
            <p className="font-semibold text-text">{status.agent}</p>
            <p>{status.action}</p>
            {status.detail && (
              <p className="tabular-nums text-text-faint">{status.detail}</p>
            )}
          </>
        ) : (
          <p>{status.action}</p>
        )}
      </div>
    </div>
  );
}
