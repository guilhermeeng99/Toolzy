import { open } from "@tauri-apps/plugin-dialog";
import { type CSSProperties, useState } from "react";
import { type ImageTarget, type ResizeMode, type ResizeOpt, convertImage } from "../lib/convert";

const TARGETS: ImageTarget[] = ["png", "jpg"];
const MODES: ResizeMode[] = ["none", "percent", "px"];

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; path: string }
  | { kind: "error"; message: string };

export function ImageTool() {
  const [path, setPath] = useState<string | null>(null);
  const [target, setTarget] = useState<ImageTarget>("png");
  const [quality, setQuality] = useState(80);
  const [mode, setMode] = useState<ResizeMode>("none");
  const [percent, setPercent] = useState(100);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function choose() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"] },
      ],
    });
    if (typeof picked === "string") {
      setPath(picked);
      setStatus({ kind: "idle" });
    }
  }

  function buildResize(): ResizeOpt | undefined {
    if (mode === "none") return undefined;
    return {
      mode,
      keepAspectRatio: keepAspect,
      percent: mode === "percent" ? percent : undefined,
      width: mode === "px" && width !== "" ? Number(width) : undefined,
      height: mode === "px" && height !== "" ? Number(height) : undefined,
    };
  }

  async function run() {
    if (!path) return;
    setStatus({ kind: "working" });
    try {
      const saved = await convertImage({
        path,
        target,
        quality: target === "jpg" ? quality : undefined,
        resize: buildResize(),
      });
      setStatus({ kind: "done", path: saved });
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }

  const fileName = path?.split(/[\\/]/).pop() ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Convert to">
          <div className="flex gap-2">
            {TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={pill(target === t)}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        {target === "jpg" ? (
          <Field label={`Quality: ${quality}`}>
            <Slider min={1} max={100} value={quality} onChange={setQuality} />
          </Field>
        ) : null}

        <Field label="Resize">
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={pill(mode === m)}>
                {m === "none" ? "original" : m}
              </button>
            ))}
          </div>

          {mode === "percent" ? (
            <div className="mt-3 flex items-center gap-3">
              <Slider min={1} max={100} value={percent} onChange={setPercent} width="12rem" />
              <span className="text-body-lg text-midnight-indigo">{percent}%</span>
            </div>
          ) : null}

          {mode === "px" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <NumberInput value={width} onChange={setWidth} placeholder="Width" />
              <span className="text-slate-blue">x</span>
              <NumberInput value={height} onChange={setHeight} placeholder="Height" />
              <label className="flex items-center gap-2 text-body text-slate-blue">
                <input
                  type="checkbox"
                  checked={keepAspect}
                  onChange={(e) => setKeepAspect(e.target.checked)}
                  className="accent-action-blue"
                />
                Keep aspect ratio
              </label>
            </div>
          ) : null}
        </Field>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={choose} className={pill(false)}>
          Choose image
        </button>
        <button
          type="button"
          onClick={run}
          disabled={!path || status.kind === "working"}
          className="rounded-lg bg-action-blue px-6 py-3 text-body-lg font-semibold text-snow-white transition hover:brightness-105 disabled:opacity-50"
        >
          {status.kind === "working" ? "Converting..." : "Convert"}
        </button>
        {fileName ? <span className="truncate text-body text-slate-blue">{fileName}</span> : null}
      </div>

      {status.kind === "done" ? (
        <p className="text-body-lg text-midnight-indigo">Saved: {status.path}</p>
      ) : null}
      {status.kind === "error" ? (
        <p className="text-body-lg text-midnight-indigo">Failed: {status.message}</p>
      ) : null}
    </div>
  );
}

function pill(active: boolean): string {
  return [
    "rounded-lg px-4 py-1.5 text-body-lg font-semibold uppercase transition-colors",
    active
      ? "bg-action-blue text-snow-white"
      : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
  ].join(" ");
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-snow-white p-6 shadow-sm-2">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-body font-semibold uppercase tracking-wide text-slate-blue">
        {label}
      </p>
      {children}
    </div>
  );
}

function Slider({
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

function NumberInput({
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
