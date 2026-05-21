import { useState } from "react";
import { type DownloadFormat, downloadMedia } from "../lib/media";
import { Card, Field, PrimaryButton, pill } from "./ui";

export function DownloadTool() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<DownloadFormat>("mp4");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const valid = /^https?:\/\//i.test(url.trim());

  async function run() {
    if (!valid) return;
    setBusy(true);
    setStatus(null);
    try {
      const path = await downloadMedia(url.trim(), format);
      setStatus(`Saved: ${path}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <input
          type="url"
          value={url}
          placeholder="Paste a video or audio link"
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-platinum-tint bg-snow-white px-4 py-3 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
        />
        <Field label="Download as">
          <div className="flex gap-2">
            <button
              type="button"
              className={pill(format === "mp4")}
              onClick={() => setFormat("mp4")}
            >
              MP4 (video)
            </button>
            <button
              type="button"
              className={pill(format === "mp3")}
              onClick={() => setFormat("mp3")}
            >
              MP3 (audio)
            </button>
          </div>
        </Field>
        <PrimaryButton onClick={run} disabled={busy || !valid}>
          {busy ? "Downloading..." : "Download"}
        </PrimaryButton>
      </Card>

      {status ? <p className="text-body-lg text-midnight-indigo">{status}</p> : null}

      <p className="text-body text-slate-blue">
        Runs on your machine and connection. Respect each site's terms — you are responsible for
        what you download.
      </p>
    </div>
  );
}
