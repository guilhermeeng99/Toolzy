import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { formatBytes, sizeDelta } from "../../lib/format";
import { baseName, stripExt } from "../../lib/path";
import {
  type CompressLevel,
  type CompressResult,
  PDF_EXTENSIONS,
  compressPdf,
} from "../../lib/pdf";
import { useSingleFile } from "../../lib/useSingleFile";
import { Card, Field, PrimaryButton, dropzoneClass, pill } from "../ui";

const LEVELS: { id: CompressLevel; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "balanced", label: "Balanced" },
  { id: "strong", label: "Strong" },
];

/** Shrink a single PDF by re-rasterizing its pages at a chosen level. */
export function CompressPdf() {
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Clear the previous result when a new file is picked.
  const { path, over, choose } = useSingleFile(
    PDF_EXTENSIONS,
    useCallback(() => {
      setResult(null);
      setError(null);
    }, []),
  );

  async function run() {
    if (!path) return;
    const out = await save({
      defaultPath: `${stripExt(path)}-compressed.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await compressPdf(path, out, level));
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
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

      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(over)}
        aria-label="Choose or drop a PDF"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          {path ? baseName(path) : "Drop a PDF here, or click to choose"}
        </span>
        <span className="text-body text-slate-blue">Compressed natively on your machine</span>
      </button>

      {path ? (
        <PrimaryButton onClick={run} disabled={busy}>
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
