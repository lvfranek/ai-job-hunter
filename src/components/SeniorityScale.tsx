"use client";

const LABELS: [number, string][] = [
  [0, "Entry level"],
  [3, "Junior"],
  [5, "Mid-level"],
  [7, "Senior"],
  [9, "Lead / Principal"],
];

function labelFor(value: number): string {
  let label = LABELS[0][1];
  for (const [threshold, text] of LABELS) {
    if (value >= threshold) label = text;
  }
  return label;
}

export function SeniorityScale({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[13px] font-medium text-text-muted">Preferred seniority</label>
        <span className="text-[13px] font-medium text-text">{labelFor(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-text"
      />
      <div className="mt-1 flex justify-between text-[11px] text-text-faint">
        <span>Entry level</span>
        <span>Lead / Principal</span>
      </div>
    </div>
  );
}
