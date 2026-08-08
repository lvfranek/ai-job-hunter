"use client";

export function Scale({
  label,
  value,
  onChange,
  labelFor,
  leftHint,
  rightHint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  labelFor: (value: number) => string;
  leftHint: string;
  rightHint: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[13px] font-medium text-text-muted">{label}</label>
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
        <span>{leftHint}</span>
        <span>{rightHint}</span>
      </div>
    </div>
  );
}
