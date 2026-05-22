import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { baseName } from "../../lib/path";
import { type PdfImageFormat, pdfToImages } from "../../lib/pdf";
import { Card, Field, PrimaryButton, Slider, dropzoneClass, pill } from "../ui";

/** Render each page of a chosen PDF to PNG/JPG next to the source file. */
export function PdfToImages() {
  const [path, setPath] = useState<string | null>(null);
  const [format, setFormat] = useState<PdfImageFormat>("png");
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof picked === "string") {
      setPath(picked);
      setPages([]);
      setError(null);
    }
  }

  async function run() {
    if (!path) return;
    setBusy(true);
    setError(null);
    setPages([]);
    try {
      setPages(await pdfToImages(path, format, scale));
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Output format">
          <div className="flex gap-2">
            {(["png", "jpg"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={pill(format === f)}
                onClick={() => setFormat(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Scale: ${scale}x`}>
          <Slider min={1} max={4} value={scale} onChange={setScale} />
        </Field>
      </Card>

      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(false)}
        aria-label="Choose a PDF"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          {path ? baseName(path) : "Click to choose a PDF"}
        </span>
        <span className="text-body text-slate-blue">
          Pages render natively, saved next to the file
        </span>
      </button>

      {path ? (
        <PrimaryButton onClick={run} disabled={busy}>
          {busy ? "Rendering..." : "Convert to images"}
        </PrimaryButton>
      ) : null}

      {error ? <p className="text-body-lg text-midnight-indigo">{error}</p> : null}
      {pages.length > 0 ? (
        <p className="text-body-lg text-midnight-indigo">
          Saved {pages.length} page(s) next to the PDF.
        </p>
      ) : null}
    </div>
  );
}
