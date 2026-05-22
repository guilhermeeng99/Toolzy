import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { AUDIO_EXTENSIONS } from "../../lib/media";
import { baseName, extOf } from "../../lib/path";
import { useFileDrop } from "../../lib/useFileDrop";
import { VIDEO_EXTENSIONS, addAudioToVideo } from "../../lib/videoEdit";
import { PrimaryButton, dropzoneClass } from "../ui";

/** One labelled picker box (video or audio). */
function PickCard({
  label,
  name,
  onChoose,
}: {
  label: string;
  name: string | null;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className={dropzoneClass(false)}
      aria-label={`Choose ${label}`}
    >
      <span className="text-body font-semibold uppercase tracking-wide text-slate-blue">
        {label}
      </span>
      <span className="text-body-lg font-semibold text-midnight-indigo">
        {name ? baseName(name) : "Click to choose"}
      </span>
    </button>
  );
}

/** Replace a video's audio track with a chosen audio file (ends at the shorter). */
export function AddAudio() {
  const [video, setVideo] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // A dropped file routes to the matching slot by extension.
  const over = useFileDrop(
    useCallback((incoming: string[]) => {
      for (const p of incoming) {
        const ext = extOf(p);
        if (VIDEO_EXTENSIONS.includes(ext)) setVideo(p);
        else if (AUDIO_EXTENSIONS.includes(ext)) setAudio(p);
      }
      setStatus(null);
    }, []),
  );

  async function chooseVideo() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (typeof picked === "string") {
      setVideo(picked);
      setStatus(null);
    }
  }

  async function chooseAudio() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
    });
    if (typeof picked === "string") {
      setAudio(picked);
      setStatus(null);
    }
  }

  async function go() {
    if (!video || !audio) return;
    setBusy(true);
    setStatus(null);
    try {
      setStatus(`Saved: ${await addAudioToVideo(video, audio)}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  return (
    <div
      className={`flex flex-col gap-6 rounded-2xl p-1 transition-colors ${over ? "ring-2 ring-action-blue" : ""}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PickCard label="Video" name={video} onChoose={chooseVideo} />
        <PickCard label="Audio" name={audio} onChoose={chooseAudio} />
      </div>
      <p className="text-body text-slate-blue">
        Replaces the video's audio with the chosen track, ending at the shorter of the two.
      </p>
      <PrimaryButton onClick={go} disabled={busy || !video || !audio}>
        {busy ? "Adding..." : "Add audio"}
      </PrimaryButton>
      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}
    </div>
  );
}
