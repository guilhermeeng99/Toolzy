import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { AUDIO_TARGETS, type AudioTarget, MEDIA_EXTENSIONS, convertMedia } from "../../lib/media";
import { type QueueItem, useBatchQueue } from "../../lib/useBatchQueue";
import { useFileDrop } from "../../lib/useFileDrop";
import { Badge, Field, PrimaryButton, dropzoneClass, focusRing, pill } from "../ui";

type MediaItem = QueueItem & Partial<{ out: string }>;

/** Convert/extract audio to mp3/m4a/wav (batch). The Media tab's default mode. */
export function ConvertAudio() {
  const [target, setTarget] = useState<AudioTarget>("mp3");

  const { items, running, pending, addPaths, run, clear } = useBatchQueue<{ out: string }>(
    MEDIA_EXTENSIONS,
    async (item) => ({ out: await convertMedia(item.path, target) }),
  );

  const over = useFileDrop(addPaths);

  async function choose() {
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Media", extensions: MEDIA_EXTENSIONS }],
    });
    if (Array.isArray(picked)) addPaths(picked);
    else if (typeof picked === "string") addPaths([picked]);
  }

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
              onClick={clear}
              disabled={running}
              className={`text-body-lg font-semibold text-slate-blue transition-colors hover:text-midnight-indigo disabled:opacity-50 ${focusRing}`}
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <FileRow key={item.id} item={item} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function FileRow({ item }: { item: MediaItem }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-snow-white p-3 shadow-sm-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-lg font-semibold text-midnight-indigo">{item.name}</p>
        <p className="truncate text-body text-slate-blue">
          {item.status === "done" ? item.out : item.status === "error" ? item.error : item.path}
        </p>
      </div>
      {item.status === "working" ? <Badge>Working</Badge> : null}
      {item.status === "done" ? <Badge>Done</Badge> : null}
    </li>
  );
}
