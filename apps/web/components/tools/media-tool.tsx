"use client";

import { Field, Segmented } from "@/components/tools/controls";
import { Dropzone } from "@/components/tools/dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { triggerDownload } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import { convertAudio } from "@/lib/media/ffmpeg";
import {
  AUDIO_TARGETS,
  type AudioTarget,
  MEDIA_ACCEPT,
  type ToolzyError,
  describeError,
} from "@toolzy/engine";
import { useState } from "react";

export function MediaTool() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<AudioTarget>("mp3");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<ToolzyError | null>(null);

  async function run() {
    if (!file) return;
    setWorking(true);
    setProgress(0);
    setError(null);
    const res = await convertAudio(file, target, { onProgress: setProgress });
    setWorking(false);
    if (res.ok) triggerDownload(res.value.blob, res.value.filename);
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <Field label="Convert to audio">
          <Segmented options={AUDIO_TARGETS} value={target} onChange={setTarget} />
        </Field>
      </Card>

      <Dropzone
        accept={MEDIA_ACCEPT}
        onFiles={(f) => {
          setFile(f[0] ?? null);
          setError(null);
        }}
        label="Drop an audio or video file here"
        hint="or click to choose. The file never leaves your device."
      />

      {file ? (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-body-lg font-semibold text-midnight-indigo">
                {file.name}
              </p>
              <p className="text-body text-slate-blue">{formatBytes(file.size)}</p>
            </div>
            <Button onClick={run} disabled={working}>
              {working ? `Converting ${Math.round(progress * 100)}%` : `Convert to ${target}`}
            </Button>
          </div>
          {working ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-pale-gray">
              <div
                className="h-full rounded-full bg-action-blue transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      <p className="text-center text-body text-slate-blue">
        First run loads the converter (~30 MB, one time). Everything runs on your device.
      </p>

      {error ? (
        <p className="text-center text-body-lg text-midnight-indigo">{describeError(error)}</p>
      ) : null}
    </div>
  );
}
