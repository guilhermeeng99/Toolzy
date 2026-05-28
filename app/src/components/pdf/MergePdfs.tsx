import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { extOf, stripExt } from "../../lib/path";
import { PDF_EXTENSIONS, mergePdfs } from "../../lib/pdf";
import { useFileDrop } from "../../lib/useFileDrop";
import { useMultiFile } from "../../lib/useMultiFile";
import { usePdfItems } from "../../lib/usePdfItems";
import { FileDropzone, PrimaryButton } from "../ui";
import { GridToolbar } from "./GridToolbar";
import { PreviewGrid } from "./PreviewGrid";

/** Merge PDFs: a reorderable preview grid (first-page thumbnails) → one PDF. */
export function MergePdfs() {
  const { items, thumbs, addPaths, remove, reorder, clear } = usePdfItems();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const addPdfs = useCallback(
    (incoming: string[]) => addPaths(incoming.filter((p) => extOf(p) === "pdf")),
    [addPaths],
  );
  const over = useFileDrop(addPdfs);
  const choose = useMultiFile(PDF_EXTENSIONS, addPdfs, "PDF");

  async function run() {
    const first = items[0];
    if (!first || items.length < 2) return;
    const out = await save({
      defaultPath: `${stripExt(first.path)}-merged.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!out) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus(
        `Saved: ${await mergePdfs(
          items.map((i) => i.path),
          out,
        )}`,
      );
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  if (items.length === 0) {
    return (
      <FileDropzone
        over={over}
        onChoose={choose}
        label="Drop PDFs here, or click to choose"
        hint="Drag to set the merge order"
        ariaLabel="Choose or drop PDFs"
      />
    );
  }

  const gridItems = items.map((i) => ({
    path: i.path,
    rotation: i.rotation,
    thumb: thumbs[i.path],
  }));

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl p-1 transition-colors ${over ? "ring-2 ring-action-blue" : ""}`}
    >
      <GridToolbar count={items.length} onAdd={choose} onClear={clear} />
      <PreviewGrid items={gridItems} onReorder={reorder} onRemove={remove} />

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={run} disabled={busy || items.length < 2}>
          {busy ? "Merging..." : "Merge PDFs"}
        </PrimaryButton>
        {items.length < 2 ? (
          <span className="text-body text-slate-blue">Add at least two PDFs to merge.</span>
        ) : null}
      </div>
      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
