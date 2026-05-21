"use client";

import { Segmented } from "@/components/tools/controls";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type DownloadFormat, downloadMedia, isDesktop } from "@/lib/desktop";
import { SITE } from "@/lib/site";
import { useEffect, useState } from "react";

export function DownloadTool() {
  const [desktop, setDesktop] = useState(false);
  // Detect after mount to avoid an SSR/prerender mismatch.
  useEffect(() => setDesktop(isDesktop()), []);

  return desktop ? <DesktopForm /> : <WebPlaceholder />;
}

function WebPlaceholder() {
  return (
    <Card className="flex flex-col items-center gap-4 p-10 text-center">
      <h2 className="text-heading-lg font-bold text-midnight-indigo">
        The downloader runs in the desktop app
      </h2>
      <p className="max-w-md text-body-lg text-slate-blue">
        Downloading from a link uses your own device and connection. Get the free Toolzy desktop app
        to use it.
      </p>
      <a
        href={`${SITE.repo}/releases`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses("primary", "lg")}
      >
        Get the desktop app
      </a>
    </Card>
  );
}

function DesktopForm() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<DownloadFormat>("mp4");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const valid = /^https?:\/\//i.test(url.trim());

  async function run() {
    if (!valid) return;
    setBusy(true);
    setStatus(null);
    try {
      const path = await downloadMedia(url.trim(), format);
      setStatus({ ok: true, message: `Saved to ${path}` });
    } catch (e) {
      setStatus({ ok: false, message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-6 p-6">
        <input
          type="url"
          value={url}
          placeholder="Paste a video or audio link"
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-platinum-tint bg-snow-white px-4 py-3 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
        />
        <Segmented
          options={["mp4", "mp3"] as const}
          value={format}
          onChange={setFormat}
          labels={{ mp4: "MP4 (video)", mp3: "MP3 (audio)" }}
        />
        <Button onClick={run} disabled={busy || !valid}>
          {busy ? "Downloading..." : "Download"}
        </Button>
      </Card>

      {status ? <p className="text-body-lg text-midnight-indigo">{status.message}</p> : null}

      <p className="text-body text-slate-blue">
        Respect each site's terms. You are responsible for what you download.
      </p>
    </div>
  );
}
