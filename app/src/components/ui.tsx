import { type CSSProperties, useState } from "react";

/** Visible keyboard-focus ring (a11y) — shared by every interactive control. */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2";

/** Selectable "segmented pill" button styling. */
export function pill(active: boolean): string {
  return [
    "rounded-lg px-4 py-1.5 text-body-lg font-semibold uppercase transition-colors",
    focusRing,
    active
      ? "bg-action-blue text-snow-white"
      : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
  ].join(" ");
}

/** Dashed drop area styling; `over` highlights during a drag. */
export function dropzoneClass(over: boolean): string {
  return [
    "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
    over
      ? "border-action-blue bg-pale-gray/60"
      : "border-platinum-tint bg-cloud-mist hover:border-action-blue",
  ].join(" ");
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, type, ...rest } = props;
  return (
    <button
      type={type === "submit" ? "submit" : "button"}
      className={`rounded-lg bg-action-blue px-6 py-3 text-body-lg font-semibold text-snow-white transition hover:brightness-105 disabled:opacity-50 ${focusRing} ${className ?? ""}`}
      {...rest}
    />
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-snow-white p-6 shadow-sm-2">{children}</div>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-pale-gray px-2 py-1 text-body font-semibold text-glacier-blue">
      {children}
    </span>
  );
}

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

export function Slider({
  min,
  max,
  value,
  onChange,
  width = "100%",
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  width?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="toolzy-range"
      style={{ width, "--fill": `${pct}%` } as CSSProperties}
    />
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input
        type={show ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="w-64 rounded-lg border border-platinum-tint bg-snow-white px-3 py-1.5 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className={`text-body font-semibold text-slate-blue hover:text-midnight-indigo ${focusRing}`}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      min={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 rounded-lg border border-platinum-tint bg-snow-white px-3 py-1.5 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
    />
  );
}
