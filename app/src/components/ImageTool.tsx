import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import {
  IMAGE_EXTENSIONS,
  IMAGE_TARGETS,
  type ImageTarget,
  QUALITY_TARGETS,
  type ResizeMode,
  type ResizeOpt,
  convertImage,
} from "../lib/convert";
import { formatBytes, sizeDelta } from "../lib/format";

const MODES: ResizeMode[] = ["none", "percent", "px"];

type ItemStatus = "pending" | "working" | "done" | "error";

interface Item {
  id: string;
  path: string;
  name: string;
  status: ItemStatus;
  inBytes?: number;
  outBytes?: number;
  outPath?: string;
  error?: string;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";

export function ImageTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<ImageTarget>("webp");
  const [quality, setQuality] = useState(80);
  const [mode, setMode] = useState<ResizeMode>("none");
  const [percent, setPercent] = useState(100);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);

  const addPaths = useCallback((paths: string[]) => {
    const imgs = paths.filter((p) => IMAGE_EXTENSIONS.includes(extOf(p)));
    if (imgs.length === 0) return;
    setItems((prev) => {
      const known = new Set(prev.map((i) => i.path));
      const next = imgs
        .filter((p) => !known.has(p))
        .map((p) => ({
          id: crypto.randomUUID(),
          path: p,
          name: baseName(p),
          status: "pending" as const,
        }));
      return next.length > 0 ? [...prev, ...next] : prev;
    });
  }, []);

  // Native OS file drop (Tauri gives real paths, not browser File objects).
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over") setOver(true);
      else if (e.payload.type === "drop") {
        setOver(false);
        addPaths(e.payload.paths);
      } else setOver(false);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [addPaths]);

  async function choose() {
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (Array.isArray(picked)) addPaths(picked);
    else if (typeof picked === "string") addPaths([picked]);
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
    setRunning(true);
    const resize = buildResize();
    const q = QUALITY_TARGETS.has(target) ? quality : undefined;
    const queue = items.filter((i) => i.status === "pending" || i.status === "error");
    for (const item of queue) {
      patch(item.id, { status: "working", error: undefined });
      try {
        const res = await convertImage({ path: item.path, target, quality: q, resize });
        patch(item.id, {
          status: "done",
          inBytes: res.inBytes,
          outBytes: res.outBytes,
          outPath: res.path,
        });
      } catch (e) {
        patch(item.id, { status: "error", error: String(e) });
      }
    }
    setRunning(false);
  }

  function patch(id: string, change: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const pending = items.filter((i) => i.status === "pending" || i.status === "error").length;
  const isLossy = QUALITY_TARGETS.has(target);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Convert to">
          <div className="flex flex-wrap gap-2">
            {IMAGE_TARGETS.map((t) => (
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

        {isLossy ? (
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

      <button
        type="button"
        onClick={choose}
        className={dropzone(over)}
        aria-label="Choose or drop images"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          Drop images here, or click to choose
        </span>
        <span className="text-body text-slate-blue">
          PNG · JPG · WebP · GIF · BMP · TIFF — processed natively on your device
        </span>
      </button>

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={running || pending === 0}
              className="rounded-lg bg-action-blue px-6 py-3 text-body-lg font-semibold text-snow-white transition hover:brightness-105 disabled:opacity-50"
            >
              {running ? "Converting..." : `Convert ${pending > 0 ? pending : ""}`}
            </button>
            <button
              type="button"
              onClick={() => setItems([])}
              disabled={running}
              className="text-body-lg font-semibold text-slate-blue transition-colors hover:text-midnight-indigo disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <FileRow key={item.id} item={item} onRemove={remove} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function FileRow({ item, onRemove }: { item: Item; onRemove: (id: string) => void }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-snow-white p-3 shadow-sm-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-lg font-semibold text-midnight-indigo">{item.name}</p>
        <p className="text-body text-slate-blue">
          {item.status === "done" && item.inBytes != null && item.outBytes != null ? (
            <>
              {formatBytes(item.inBytes)} {"->"} {formatBytes(item.outBytes)}{" "}
              <span className="font-semibold text-action-blue">
                {sizeDelta(item.inBytes, item.outBytes)}
              </span>
            </>
          ) : item.status === "error" ? (
            <span className="text-midnight-indigo">{item.error}</span>
          ) : (
            item.path
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {item.status === "working" ? <Badge>Working</Badge> : null}
        {item.status === "done" ? <Badge>Done</Badge> : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-slate-blue transition-colors hover:text-midnight-indigo"
          aria-label={`Remove ${item.name}`}
        >
          x
        </button>
      </div>
    </li>
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

function dropzone(over: boolean): string {
  return [
    "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
    over
      ? "border-action-blue bg-pale-gray/60"
      : "border-platinum-tint bg-cloud-mist hover:border-action-blue",
  ].join(" ");
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-snow-white p-6 shadow-sm-2">{children}</div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-pale-gray px-2 py-1 text-body font-semibold text-glacier-blue">
      {children}
    </span>
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
