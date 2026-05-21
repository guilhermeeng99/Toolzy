import type { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  type AudioTarget,
  type ConversionOutput,
  type ConvertContext,
  MAX_MEDIA_BYTES,
  type Result,
  audioOutputName,
  buildAudioArgs,
  err,
  errors,
  ok,
} from "@toolzy/engine";

// Lazily created, reused across conversions. The ~30 MB core loads on first use.
let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) ffmpegPromise = loadFFmpeg();
  return ffmpegPromise;
}

async function loadFFmpeg(): Promise<FFmpeg> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg();
  const base = `${location.origin}/ffmpeg`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ffmpeg;
}

/** ffmpeg needs an extension to pick a demuxer; keep the original or default. */
function inputNameFor(file: File): string {
  const ext = file.name.match(/\.[^./\\]+$/)?.[0] ?? ".bin";
  return `input${ext}`;
}

function mimeFor(target: AudioTarget): string {
  if (target === "mp3") return "audio/mpeg";
  if (target === "wav") return "audio/wav";
  return "audio/mp4";
}

export async function convertAudio(
  file: File,
  target: AudioTarget,
  ctx?: ConvertContext,
): Promise<Result<ConversionOutput>> {
  if (file.size > MAX_MEDIA_BYTES) return err(errors.fileTooLarge(file.size, MAX_MEDIA_BYTES));

  try {
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import("@ffmpeg/util");

    const onProgress = ctx?.onProgress;
    const handler = ({ progress }: { progress: number }) =>
      onProgress?.(Math.min(1, Math.max(0, progress)));
    if (onProgress) ffmpeg.on("progress", handler);

    const inName = inputNameFor(file);
    const outName = `output.${target}`;
    try {
      await ffmpeg.writeFile(inName, await fetchFile(file));
      const code = await ffmpeg.exec(buildAudioArgs(inName, outName, target));
      if (code !== 0) return err(errors.encodeFailed(target, `ffmpeg exited ${code}`));
      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data as BlobPart], { type: mimeFor(target) });
      return ok({
        blob,
        format: target,
        filename: audioOutputName(file.name, target),
        bytes: blob.size,
      });
    } finally {
      if (onProgress) ffmpeg.off("progress", handler);
      await ffmpeg.deleteFile(inName).catch(() => {});
      await ffmpeg.deleteFile(outName).catch(() => {});
    }
  } catch (cause) {
    return err(errors.encodeFailed(target, cause));
  }
}
