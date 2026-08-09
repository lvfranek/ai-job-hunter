import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import type { AgentStatusData } from "@/lib/mock-data";

export function AgentStatus({ status }: { status: AgentStatusData }) {
  const isActive = status.state !== "idle";

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
          isActive ? "bg-[#101828]/10 text-[#1E2A3D]" : "bg-[#101828]/5 text-[#94A3B8]"
        }`}
      >
        <CircleNotch size={12} weight="bold" className={isActive ? "animate-spin" : ""} />
      </span>
      <div className="min-w-0 text-[12px] leading-snug text-[#64748B]">
        {isActive ? (
          <>
            <p className="text-[#1E2A3D]">{status.action}</p>
            {status.detail && (
              <p className="tabular-nums text-[#94A3B8]">{status.detail}</p>
            )}
          </>
        ) : (
          <p>{status.action}</p>
        )}
      </div>
    </div>
  );
}
