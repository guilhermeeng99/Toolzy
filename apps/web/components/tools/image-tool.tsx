"use client";

import { Dropzone } from "@/components/tools/dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { downloadZip, triggerDownload } from "@/lib/download";
import { formatBytes, sizeDelta } from "@/lib/format";
import type { ImageWorkerApi } from "@/lib/workers/image.worker";
import {
  type ConversionOutput,
  type ImageOptions,
  type ImageTarget,
  type ResizeMode,
  type ToolzyError,
  describeError,
} from "@toolzy/engine";
import * as Comlink from "comlink";
import { useEffect, useRef, useState } from "react";

type Status = "pending" | "working" | "done" | "error";

interface Item {
  id: string;
  file: File;
  thumbUrl: string;
  status: Status;
  output?: ConversionOutput;
  error?: ToolzyError;
}

const TARGETS: ImageTarget[] = ["png", "jpg", "webp"];
const ACCEPT = "image/png,image/jpeg,image/webp";

function spawnWorker() {
  const worker = new Worker(new URL("../../lib/workers/image.worker.ts", import.meta.url), {
    type: "module",
  });
  return { worker, api: Comlink.wrap<ImageWorkerApi>(worker) };
}

export function ImageTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<ImageTarget>("webp");
  const [quality, setQuality] = useState(80);
  const [resizeMode, setResizeMode] = useState<ResizeMode>("none");
  const [percent, setPercent] = useState(100);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);
  const [running, setRunning] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ImageWorkerApi> | null>(null);
  const itemsRef = useRef<Item[]>(items);
  itemsRef.current = items;

  useEffect(() => {
    const { worker, api } = spawnWorker();
    workerRef.current = worker;
    apiRef.current = api;
    return () => {
      worker.terminate();
      for (const it of itemsRef.current) URL.revokeObjectURL(it.thumbUrl);
    };
  }, []);

  const isLossy = target !== "png";
  const doneCount = items.filter((i) => i.status === "done").length;
  const queueCount = items.filter((i) => i.status === "pending" || i.status === "error").length;

  function buildOptions(): ImageOptions {
    if (resizeMode === "none") return { quality };
    return {
      quality,
      resize: {
        mode: resizeMode,
        keepAspectRatio: keepAspect,
        percent: resizeMode === "percent" ? percent : undefined,
        width: resizeMode === "px" && width !== "" ? Number(width) : undefined,
        height: resizeMode === "px" && height !== "" ? Number(height) : undefined,
      },
    };
  }

  function addFiles(files: File[]) {
    const next: Item[] = files
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        thumbUrl: URL.createObjectURL(f),
        status: "pending",
      }));
    if (next.length > 0) setItems((prev) => [...prev, ...next]);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.thumbUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function clearAll() {
    for (const it of itemsRef.current) URL.revokeObjectURL(it.thumbUrl);
    setItems([]);
  }

  function patch(id: string, change: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }

  async function run() {
    const api = apiRef.current;
    if (!api) return;
    const opts = buildOptions();
    setRunning(true);
    const queue = itemsRef.current.filter((i) => i.status === "pending" || i.status === "error");
    for (const item of queue) {
      patch(item.id, { status: "working", error: undefined });
      try {
        const res = await api.convert(item.file, target, opts);
        if (res.ok) patch(item.id, { status: "done", output: res.value });
        else patch(item.id, { status: "error", error: res.error });
      } catch (cause) {
        patch(item.id, { status: "error", error: { kind: "worker_failed", cause: String(cause) } });
      }
    }
    setRunning(false);
  }

  function cancel() {
    workerRef.current?.terminate();
    const { worker, api } = spawnWorker();
    workerRef.current = worker;
    apiRef.current = api;
    setRunning(false);
    setItems((prev) => prev.map((i) => (i.status === "working" ? { ...i, status: "pending" } : i)));
  }

  function downloadOne(item: Item) {
    if (item.output) triggerDownload(item.output.blob, item.output.filename);
  }

  async function downloadAll() {
    const files = itemsRef.current.flatMap((i) =>
      i.output ? [{ name: i.output.filename, blob: i.output.blob }] : [],
    );
    if (files.length > 0) await downloadZip(files, "toolzy-images.zip");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-6 p-6">
        <Field label="Convert to">
          <div className="flex gap-2">
            {TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-body-lg font-semibold uppercase transition-colors",
                  target === t
                    ? "bg-action-blue text-snow-white"
                    : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {target === "jpg" ? (
            <p className="mt-2 text-body text-slate-blue">
              JPG has no transparency; transparent areas become white.
            </p>
          ) : null}
        </Field>

        {isLossy ? (
          <Field label={`Quality: ${quality}`}>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-action-blue"
              aria-label="Quality"
            />
          </Field>
        ) : null}

        <Field label="Resize">
          <div className="flex flex-wrap items-center gap-2">
            {(["none", "percent", "px"] as ResizeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setResizeMode(m)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-body font-semibold capitalize transition-colors",
                  resizeMode === m
                    ? "bg-action-blue text-snow-white"
                    : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
                )}
              >
                {m === "none" ? "Original size" : m}
              </button>
            ))}
          </div>

          {resizeMode === "percent" ? (
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={100}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="w-48 accent-action-blue"
                aria-label="Resize percent"
              />
              <span className="text-body-lg text-midnight-indigo">{percent}%</span>
            </div>
          ) : null}

          {resizeMode === "px" ? (
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

      <Dropzone accept={ACCEPT} onFiles={addFiles} />

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={run} disabled={running || queueCount === 0}>
              {running ? "Converting..." : `Convert ${queueCount > 0 ? queueCount : ""}`}
            </Button>
            {running ? (
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            ) : null}
            {doneCount > 0 ? (
              <Button variant="ghost" onClick={downloadAll}>
                Download all (.zip)
              </Button>
            ) : null}
            <Button variant="ghostNeutral" onClick={clearAll} disabled={running}>
              Clear
            </Button>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <FileRow key={item.id} item={item} onDownload={downloadOne} onRemove={removeItem} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function FileRow({
  item,
  onDownload,
  onRemove,
}: {
  item: Item;
  onDownload: (item: Item) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="flex items-center gap-4 p-3">
      <img
        src={item.thumbUrl}
        alt={item.file.name}
        className="h-12 w-12 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-lg font-semibold text-midnight-indigo">{item.file.name}</p>
        <p className="text-body text-slate-blue">
          {formatBytes(item.file.size)}
          {item.status === "done" && item.output ? (
            <>
              {" -> "}
              {formatBytes(item.output.bytes)}{" "}
              <span className="font-semibold text-action-blue">
                {sizeDelta(item.file.size, item.output.bytes)}
              </span>
            </>
          ) : null}
          {item.status === "error" && item.error ? (
            <span className="text-midnight-indigo"> {describeError(item.error)}</span>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.status === "working" ? <Badge>Working</Badge> : null}
        {item.status === "done" ? (
          <Button size="sm" onClick={() => onDownload(item)}>
            Download
          </Button>
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-slate-blue transition-colors hover:text-midnight-indigo"
          aria-label={`Remove ${item.file.name}`}
        >
          x
        </button>
      </div>
    </Card>
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
