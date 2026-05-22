import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { formatBytes, sizeDelta } from "../../lib/format";
import { baseName, extOf, stripExt } from "../../lib/path";
import { type CompressLevel, type CompressResult, compressPdf } from "../../lib/pdf";
import { useFileDrop } from "../../lib/useFileDrop";
import { Card, Field, PrimaryButton, dropzoneClass, pill } from "../ui";

const LEVELS: { id: CompressLevel; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "balanced", label: "Balanced" },
  { id: "strong", label: "Strong" },
];

/** Shrink a single PDF by re-rasterizing its pages at a chosen level. */
export function CompressPdf() {
  const [path, setPath] = useState<string | null>(null);
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickPath = useCallback((p: string) => {
    setPath(p);
    setResult(null);
    setError(null);
  }, []);

  const over = useFileDrop(
    useCallback(
      (incoming: string[]) => {
        const pdf = incoming.find((p) => extOf(p) === "pdf");
        if (pdf) pickPath(pdf);
      },
      [pickPath],
    ),
  );

  async function choose() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof picked === "string") pickPath(picked);
  }

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
