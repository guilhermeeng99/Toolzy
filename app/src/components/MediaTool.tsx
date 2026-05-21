import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { AUDIO_TARGETS, type AudioTarget, MEDIA_EXTENSIONS, convertMedia } from "../lib/media";
import { Badge, Field, PrimaryButton, dropzoneClass, pill } from "./ui";

type ItemStatus = "pending" | "working" | "done" | "error";

interface Item {
  id: string;
  path: string;
  name: string;
  status: ItemStatus;
  out?: string;
  error?: string;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";

export function MediaTool() {
  const [items, setItems] = useState<Item[]>([]);
  const [target, setTarget] = useState<AudioTarget>("mp3");
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);

  const addPaths = useCallback((incoming: string[]) => {
    const media = incoming.filter((p) => MEDIA_EXTENSIONS.includes(extOf(p)));
    if (media.length === 0) return;
    setItems((prev) => {
      const known = new Set(prev.map((i) => i.path));
      const next = media
        .filter((p) => !known.has(p))
        .map((p) => ({
          id: crypto.randomUUID(),
          path: p,
          name: baseName(p),
          status: "pending" as const,
        }));
      return next.length > 0 ? [...prev, ...next] : prev;
    });
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
      filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }],
    });
    if (Array.isArray(picked)) addPaths(picked);
    else if (typeof picked === "string") addPaths([picked]);
  }

  function patch(id: string, change: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }

  async function run() {
    setRunning(true);
    const queue = items.filter((i) => i.status === "pending" || i.status === "error");
    for (const item of queue) {
      patch(item.id, { status: "working", error: undefined });
      try {
        const out = await convertMedia(item.path, target);
        patch(item.id, { status: "done", out });
      } catch (e) {
        patch(item.id, { status: "error", error: String(e) });
      }
    }
    setRunning(false);
  }

  const pending = items.filter((i) => i.status === "pending" || i.status === "error").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-snow-white p-6 shadow-sm-2">
        <Field label="Convert to audio">
          <div className="flex gap-2">
            {AUDIO_TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                className={pill(target === t)}
                onClick={() => setTarget(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <button
        type="button"
        onClick={choose}
        className={dropzoneClass(over)}
        aria-label="Choose or drop media"
      >
        <span className="text-body-lg font-semibold text-midnight-indigo">
          Drop audio/video here, or click to choose
        </span>
        <span className="text-body text-slate-blue">
          Converted natively with ffmpeg, on your device
        </span>
      </button>

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={run} disabled={running || pending === 0}>
              {running ? "Converting..." : `Convert ${pending > 0 ? pending : ""}`}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setItems([])}
              disabled={running}
              className="text-body-lg font-semibold text-slate-blue transition-colors hover:text-midnight-indigo disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 rounded-2xl bg-snow-white p-3 shadow-sm-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-lg font-semibold text-midnight-indigo">
                    {item.name}
                  </p>
                  <p className="truncate text-body text-slate-blue">
                    {item.status === "done"
                      ? item.out
                      : item.status === "error"
                        ? item.error
                        : item.path}
                  </p>
                </div>
                {item.status === "working" ? <Badge>Working</Badge> : null}
                {item.status === "done" ? <Badge>Done</Badge> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
