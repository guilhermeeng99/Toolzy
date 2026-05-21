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
          className={cn(
            "rounded-lg px-4 py-1.5 text-body font-semibold uppercase transition-colors",
            value === o
              ? "bg-action-blue text-snow-white"
              : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
          )}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
