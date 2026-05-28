import { save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { formatBytes, sizeDelta } from "../../lib/format";
import { baseName, stripExt } from "../../lib/path";
import {
  type CompressLevel,
  type CompressResult,
  PDF_EXTENSIONS,
  compressPdf,
} from "../../lib/pdf";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { useSingleFile } from "../../lib/useSingleFile";
import { Card, Field, FileDropzone, PrimaryButton, pill } from "../ui";

const LEVELS: { id: CompressLevel; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "balanced", label: "Balanced" },
  { id: "strong", label: "Strong" },
];

/** Shrink a single PDF by re-rasterizing its pages at a chosen level. */
export function CompressPdf() {
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const { busy, result, error, run, reset } = useAsyncAction<CompressResult>();
  // Clear the previous result when a new file is picked.
  const { path, over, choose } = useSingleFile(PDF_EXTENSIONS, reset);

  async function go() {
    if (!path) return;
    const out = await save({
      defaultPath: `${stripExt(path)}-compressed.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    run(() => compressPdf(path, out, level));
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Compression level">
          <div className="flex gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={pill(level === l.id)}
                onClick={() => setLevel(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Field>
        <p className="text-body text-slate-blue">
          Pages are re-rendered as images, so the file shrinks but text is no longer selectable —
          best for scanned or image-heavy PDFs.
        </p>
      </Card>

      <FileDropzone
        over={over}
        onChoose={choose}
        label={path ? baseName(path) : "Drop a PDF here, or click to choose"}
        hint="Compressed natively on your machine"
        ariaLabel="Choose or drop a PDF"
      />

      {path ? (
        <PrimaryButton onClick={go} disabled={busy}>
          {busy ? "Compressing..." : "Compress PDF"}
        </PrimaryButton>
      ) : null}

      {error ? <p className="text-body-lg text-midnight-indigo">{error}</p> : null}
      {result ? (
        <p className="text-body-lg text-midnight-indigo">
          {formatBytes(result.before)} → {formatBytes(result.after)} (
          {sizeDelta(result.before, result.after)})
          <br />
          <span className="text-body text-slate-blue">Saved: {result.path}</span>
        </p>
      ) : null}
    </div>
  );
}
