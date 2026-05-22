import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { IMAGE_EXTENSIONS } from "../../lib/convert";
import { extOf } from "../../lib/path";
import { type Margin, type Orientation, type PageSize, imagesToPdf } from "../../lib/pdf";
import { useFileDrop } from "../../lib/useFileDrop";
import { usePdfItems } from "../../lib/usePdfItems";
import { Card, Field, PrimaryButton, dropzoneClass, focusRing } from "../ui";
import { GridToolbar } from "./GridToolbar";
import { type PageFrame, PreviewGrid } from "./PreviewGrid";

const PAGE_SIZES: { id: PageSize; label: string }[] = [
  { id: "fit", label: "Fit to image" },
  { id: "a4", label: "A4" },
  { id: "letter", label: "Letter" },
  { id: "legal", label: "Legal" },
];

// mm dimensions (portrait) used to preview the page sheet live — mirrors the engine.
const PAGE_MM: Record<Exclude<PageSize, "fit">, [number, number]> = {
  a4: [210, 297],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
};
const MARGIN_MM: Record<Margin, number> = { none: 0, small: 10, large: 25 };

/** Page sheet for the preview cards (undefined in "fit" mode → raw thumbnail). */
function frameFor(
  pageSize: PageSize,
  orientation: Orientation,
  margin: Margin,
): PageFrame | undefined {
  if (pageSize === "fit") return undefined;
  const [w, h] = PAGE_MM[pageSize];
  const [pageW, pageH] = orientation === "landscape" ? [h, w] : [w, h];
  return { pageW, pageH, marginMm: MARGIN_MM[margin] };
}

/** Compact full-width segmented button — fills its grid cell so long labels
 *  ("LANDSCAPE", "LARGE") never overflow the narrow options panel. */
function segBtn(active: boolean): string {
  return [
    "w-full truncate rounded-lg px-2 py-1.5 text-body font-semibold uppercase transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-40",
    focusRing,
    active
      ? "bg-action-blue text-snow-white"
      : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
  ].join(" ");
}

/** Images → PDF: a reorderable preview grid + an iLovePDF-style options panel. */
export function ImagesToPdf() {
  const { items, thumbs, addPaths, remove, reorder, rotate, clear } = usePdfItems();
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margin, setMargin] = useState<Margin>("none");
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const addImages = useCallback(
    (incoming: string[]) => addPaths(incoming.filter((p) => IMAGE_EXTENSIONS.includes(extOf(p)))),
    [addPaths],
  );
  const over = useFileDrop(addImages);

  async function choose() {
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (Array.isArray(picked)) addImages(picked);
    else if (typeof picked === "string") addImages([picked]);
  }

  async function create() {
    if (items.length === 0) return;
    const out = await save({
      defaultPath: "toolzy.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setBusy(true);
    setStatus(null);
    try {
      const saved = await imagesToPdf(items, { pageSize, orientation, margin, merge }, out);
      setStatus(
        saved.length > 1 ? `Saved ${saved.length} PDFs next to your file.` : `Saved: ${saved[0]}`,
      );
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  if (items.length === 0) {
    return (
      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(over)}
        aria-label="Choose or drop images"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          Drop images here, or click to choose
        </span>
        <span className="text-body text-slate-blue">
          Reorder, rotate, and set the page layout next
        </span>
      </button>
    );
  }

  const gridItems = items.map((i) => ({
    path: i.path,
    rotation: i.rotation,
    thumb: thumbs[i.path],
  }));
  const fixed = pageSize !== "fit";
  const frame = frameFor(pageSize, orientation, margin);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div
        className={`flex flex-1 flex-col gap-4 rounded-2xl p-1 transition-colors ${over ? "ring-2 ring-action-blue" : ""}`}
      >
        <GridToolbar count={items.length} onAdd={choose} onClear={clear} />
        <PreviewGrid
          items={gridItems}
          onReorder={reorder}
          onRemove={remove}
          onRotate={rotate}
          frame={frame}
        />
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
        <Card>
          <Field label="Page size">
            <div className="relative">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as PageSize)}
                className="w-full appearance-none rounded-lg border border-platinum-tint bg-snow-white px-3 py-2 pr-9 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-blue"
              >
                ▾
              </span>
            </div>
          </Field>
          <Field label="Orientation">
            <div className="grid grid-cols-2 gap-2">
              {(["portrait", "landscape"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={!fixed}
                  className={segBtn(orientation === o)}
                  onClick={() => setOrientation(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Margin">
            <div className="grid grid-cols-3 gap-2">
              {(["none", "small", "large"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!fixed}
                  className={segBtn(margin === m)}
                  onClick={() => setMargin(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-body-lg text-midnight-indigo">
            <input
              type="checkbox"
              checked={merge}
              onChange={(e) => setMerge(e.target.checked)}
              className="h-4 w-4 accent-action-blue"
            />
            Merge into one PDF
          </label>
        </Card>

        <PrimaryButton onClick={create} disabled={busy}>
          {busy ? "Creating PDF..." : "Convert to PDF"}
        </PrimaryButton>
        {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
      </aside>
    </div>
  );
}
