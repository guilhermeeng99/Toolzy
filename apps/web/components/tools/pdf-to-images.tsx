"use client";

import { Field, Segmented } from "@/components/tools/controls";
import { Dropzone } from "@/components/tools/dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadZip, triggerDownload } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import { pdfToImages } from "@/lib/pdf/render";
import {
  type ConversionOutput,
  type PdfToImagesOptions,
  type ToolzyError,
  describeError,
} from "@toolzy/engine";
import { useEffect, useMemo, useState } from "react";

type Phase = "idle" | "working" | "done" | "error";

export function PdfToImages() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [scale, setScale] = useState(2);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [pages, setPages] = useState<ConversionOutput[]>([]);
  const [error, setError] = useState<ToolzyError | null>(null);

  function reset(nextFile: File | null) {
    setFile(nextFile);
    setPhase("idle");
    setPages([]);
    setError(null);
  }

  async function run() {
    if (!file) return;
    setPhase("working");
    setProgress(0);
    setPages([]);
    setError(null);
    const options: PdfToImagesOptions = { format, scale, quality: 85 };
    const res = await pdfToImages(file, options, { onProgress: setProgress });
    if (res.ok) {
      setPages(res.value);
      setPhase("done");
    } else {
      setError(res.error);
      setPhase("error");
    }
  }

  async function downloadAll() {
    if (pages.length === 0) return;
    await downloadZip(
      pages.map((p) => ({ name: p.filename, blob: p.blob })),
      "toolzy-pdf-pages.zip",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-6 p-6">
        <Field label="Output format">
          <Segmented options={["png", "jpg"] as const} value={format} onChange={setFormat} />
        </Field>
        <Field label={`Scale: ${scale}x`}>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-full accent-action-blue"
            aria-label="Render scale"
          />
        </Field>
      </Card>

      <Dropzone accept="application/pdf" onFiles={(f) => reset(f[0] ?? null)} />

      {file ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="truncate text-body-lg font-semibold text-midnight-indigo">
            {file.name}
          </span>
          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={phase === "working"}>
              {phase === "working"
                ? `Rendering ${Math.round(progress * 100)}%`
                : "Convert to images"}
            </Button>
            {pages.length > 0 ? (
              <Button variant="ghost" onClick={downloadAll}>
                Download all (.zip)
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {error ? <p className="text-body-lg text-midnight-indigo">{describeError(error)}</p> : null}

      {pages.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pages.map((p) => (
            <PageThumb key={p.filename} page={p} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageThumb({ page }: { page: ConversionOutput }) {
  const url = useMemo(() => URL.createObjectURL(page.blob), [page.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <Card className="flex flex-col gap-2 p-2">
      <img
        src={url}
        alt={page.filename}
        className="aspect-[3/4] w-full rounded-lg bg-cloud-mist object-contain"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-body text-slate-blue">{formatBytes(page.bytes)}</span>
        <Button size="sm" onClick={() => triggerDownload(page.blob, page.filename)}>
          Save
        </Button>
      </div>
    </Card>
  );
}
