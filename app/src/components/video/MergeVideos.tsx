import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { baseName, extOf, stripExt } from "../../lib/path";
import { useFileDrop } from "../../lib/useFileDrop";
import { VIDEO_EXTENSIONS, mergeVideos } from "../../lib/videoEdit";
import { PrimaryButton, dropzoneClass, focusRing } from "../ui";

/** Concatenate clips of the same format into one video (order = list order). */
export function MergeVideos() {
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const add = useCallback((incoming: string[]) => {
    const vids = incoming.filter((p) => VIDEO_EXTENSIONS.includes(extOf(p)));
    if (vids.length === 0) return;
    setPaths((prev) => {
      const known = new Set(prev);
      return [...prev, ...vids.filter((p) => !known.has(p))];
    });
    setStatus(null);
  }, []);
  const over = useFileDrop(add);

  async function choose() {
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (Array.isArray(picked)) add(picked);
    else if (typeof picked === "string") add([picked]);
  }

  const move = (i: number, delta: number) =>
    setPaths((prev) => {
      const j = i + delta;
      const a = prev[i];
      const b = prev[j];
      if (a === undefined || b === undefined) return prev;
      const next = [...prev];
      next[i] = b;
      next[j] = a;
      return next;
    });
  const removeAt = (i: number) => setPaths((prev) => prev.filter((_, k) => k !== i));

  async function go() {
    const first = paths[0];
    if (paths.length < 2 || !first) return;
    const ext = extOf(first);
    const out = await save({
      defaultPath: `${stripExt(first)}-merged.${ext}`,
      filters: [{ name: "Video", extensions: [ext] }],
    });
    if (!out) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus(`Saved: ${await mergeVideos(paths, out)}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  if (paths.length === 0) {
    return (
      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(over)}
        aria-label="Choose or drop videos"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          Drop videos here, or click to choose
        </span>
        <span className="text-body text-slate-blue">
          Clips must share the same format (codec, resolution)
        </span>
      </button>
    );
  }

  const linkBtn = `text-body font-semibold text-slate-blue transition-colors hover:text-midnight-indigo disabled:opacity-40 ${focusRing}`;

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl p-1 transition-colors ${over ? "ring-2 ring-action-blue" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-body-lg font-semibold text-midnight-indigo">{paths.length} videos</p>
        <div className="flex gap-4">
          <button type="button" onClick={choose} className={linkBtn}>
            Add
          </button>
          <button type="button" onClick={() => setPaths([])} className={linkBtn}>
            Clear
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {paths.map((p, i) => (
          <li key={p} className="flex items-center gap-3 rounded-2xl bg-snow-white p-3 shadow-sm-2">
            <span className="w-6 text-center text-body font-semibold text-slate-blue">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-body-lg text-midnight-indigo">
              {baseName(p)}
            </span>
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move up"
              className={linkBtn}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === paths.length - 1}
              aria-label="Move down"
              className={linkBtn}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="Remove"
              className={linkBtn}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={go} disabled={busy || paths.length < 2}>
          {busy ? "Merging..." : "Merge videos"}
        </PrimaryButton>
        {paths.length < 2 ? (
          <span className="text-body text-slate-blue">Add at least two videos.</span>
        ) : null}
      </div>
      <p className="text-body text-slate-blue">
        Uses a lossless join — clips must share the same codec and resolution.
      </p>
      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
