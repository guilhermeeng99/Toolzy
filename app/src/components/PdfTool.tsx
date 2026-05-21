import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { IMAGE_EXTENSIONS } from "../lib/convert";
import { type PdfImageFormat, imagesToPdf, pdfToImages } from "../lib/pdf";
import { Card, Field, PrimaryButton, Slider, dropzoneClass, pill } from "./ui";

type Mode = "to-images" | "to-pdf";

export function PdfTool() {
  const [mode, setMode] = useState<Mode>("to-images");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center gap-2">
        <button
          type="button"
          className={pill(mode === "to-images")}
          onClick={() => setMode("to-images")}
        >
          PDF to images
        </button>
        <button type="button" className={pill(mode === "to-pdf")} onClick={() => setMode("to-pdf")}>
          Images to PDF
        </button>
      </div>
      {mode === "to-images" ? <PdfToImages /> : <ImagesToPdf />}
    </div>
  );
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";

function PdfToImages() {
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

function ImagesToPdf() {
  const [paths, setPaths] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const addPaths = useCallback((incoming: string[]) => {
    const imgs = incoming.filter((p) => IMAGE_EXTENSIONS.includes(extOf(p)));
    if (imgs.length === 0) return;
    setPaths((prev) => [...prev, ...imgs.filter((p) => !prev.includes(p))]);
  }, []);

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

  async function create() {
    if (paths.length === 0) return;
    const out = await save({
      defaultPath: "toolzy.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setBusy(true);
    setStatus(null);
    try {
      const saved = await imagesToPdf(paths, out);
      setStatus(`Saved: ${saved}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(over)}
        aria-label="Choose or drop images"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          Drop images here, or click to choose
        </span>
        <span className="text-body text-slate-blue">One image per page, in the order added</span>
      </button>

      {paths.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2">
            {paths.map((p, i) => (
              <li
                key={p}
                className="flex items-center gap-3 rounded-xl bg-snow-white p-3 text-body-lg shadow-sm-2"
              >
                <span className="w-6 shrink-0 text-center font-semibold text-slate-blue">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-midnight-indigo">{baseName(p)}</span>
                <button
                  type="button"
                  onClick={() => setPaths((prev) => prev.filter((x) => x !== p))}
                  className="text-slate-blue hover:text-midnight-indigo"
                  aria-label={`Remove ${baseName(p)}`}
                >
                  x
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={create} disabled={busy}>
              {busy ? "Creating PDF..." : "Create PDF"}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setPaths([])}
              disabled={busy}
              className="text-body-lg font-semibold text-slate-blue transition-colors hover:text-midnight-indigo disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </>
      ) : null}

      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
