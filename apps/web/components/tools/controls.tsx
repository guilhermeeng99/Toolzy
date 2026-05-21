"use client";

import { cn } from "@/lib/cn";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-body font-semibold uppercase tracking-wide text-slate-blue">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * Shared "segmented pill" styling for the selectable button groups (target
 * format, resize mode, tabs). Callers add size/casing via `extra`; the active /
 * inactive color logic lives here so it stays consistent across tools.
 */
export function pillClass(active: boolean, extra?: string): string {
  return cn(
    "rounded-lg font-semibold transition-colors",
    active
      ? "bg-action-blue text-snow-white"
      : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
    extra,
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={pillClass(value === o, "px-4 py-1.5 text-body uppercase")}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
