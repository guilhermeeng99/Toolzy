import { useCallback, useEffect, useState } from "react";
import { formatBytes, sizeDelta } from "../../lib/format";
import { baseName } from "../../lib/path";
import { formatTime } from "../../lib/time";
import { useSingleFile } from "../../lib/useSingleFile";
import {
  type CompressLevel,
  type CompressResult,
  VIDEO_EXTENSIONS,
  compressVideo,
} from "../../lib/videoEdit";
import { Card, Field, FileDropzone, PrimaryButton, Spinner, pill } from "../ui";

const LEVELS: { id: CompressLevel; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Best quality, modest shrink" },
  { id: "balanced", label: "Balanced", hint: "Good shrink, keeps resolution" },
  { id: "strong", label: "Strong", hint: "Smallest — caps to 720p, ideal for sharing" },
];

/** Shrink a single video by re-encoding to H.264/AAC mp4 at a chosen level. */
export function VideoCompress() {
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { path, over, choose } = useSingleFile(
    VIDEO_EXTENSIONS,
    useCallback(() => {
      setResult(null);
      setError(null);
    }, []),
  );

  // Re-encoding has no streamed progress yet; a spinner + elapsed timer makes a long
  // compress clearly "working", not frozen.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  async function run() {
    if (!path) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await compressVideo(path, level));
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  const current = LEVELS.find((l) => l.id === level);

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
          {current?.hint}. Re-encodes to H.264 MP4 — plays anywhere and is smaller to share.
        </p>
      </Card>

      <FileDropzone
        over={over}
        onChoose={choose}
        label={path ? baseName(path) : "Drop a video here, or click to choose"}
        hint="Compressed natively on your machine"
        ariaLabel="Choose or drop a video"
      />

      {path && !busy ? <PrimaryButton onClick={run}>Compress video</PrimaryButton> : null}

      {busy ? (
        <div className="flex items-center gap-3 rounded-lg bg-action-blue/10 px-4 py-3 text-action-blue">
          <Spinner />
          <span className="text-body-lg font-medium">
            Compressing… {formatTime(elapsed)} — re-encoding on your CPU, this can take a while.
          </span>
        </div>
      ) : null}

      {error ? <p className="break-words text-body-lg text-danger">{error}</p> : null}
      {result ? (
        <p className="text-body-lg text-midnight-indigo">
          {formatBytes(result.before)} → {formatBytes(result.after)} (
          {sizeDelta(result.before, result.after)})
          <br />
          <span className="break-words text-body text-slate-blue">Saved: {result.path}</span>
        </p>
      ) : null}
    </div>
  );
}
