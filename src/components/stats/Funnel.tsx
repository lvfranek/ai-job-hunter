import type { FunnelStep } from "@/lib/keyword-stats";
import { chart, fmtNumber } from "@/components/stats/ui";

/** Found → scored → good → interested → applied → interview, as one series of bars. */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="space-y-2.5">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1] : null;
        return (
          <li
            key={step.label}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-[13px]"
          >
            <span className="leading-tight">
              <span className="block text-text-muted">{step.label}</span>
              {prev && prev.value > 0 && (
                <span className="block text-[11px] tabular-nums text-text-faint">
                  {Math.round((step.value / prev.value) * 100)}% of {prev.label.toLowerCase()}
                </span>
              )}
            </span>
            <span className="h-3.5" aria-hidden="true">
              {step.value > 0 && (
                <span
                  className="block h-full rounded-r-sm"
                  style={{
                    width: `max(${(step.value / max) * 100}%, 3px)`,
                    background: chart.accent,
                  }}
                />
              )}
            </span>
            <span className="text-right font-semibold tabular-nums text-[#1E2A3D]">
              {fmtNumber(step.value)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
