import { Channel, invoke } from "@tauri-apps/api/core";

export const AUDIO_TARGETS = ["mp3", "m4a", "wav"] as const;
export type AudioTarget = (typeof AUDIO_TARGETS)[number];

/** Source extensions accepted by the media converter picker / drag-drop. */
export const MEDIA_EXTENSIONS = [
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "mp3",
  "wav",
  "m4a",
  "flac",
  "aac",
  "ogg",
];

/** Convert/extract audio from a media file via the bundled ffmpeg sidecar. */
export function convertMedia(path: string, target: AudioTarget): Promise<string> {
  return invoke<string>("convert_media", { path, target });
}

export type DownloadFormat = "mp4" | "mp3";

/** One downloadable MP4 quality; `filesize` is the merged video+audio byte estimate. */
export interface VideoOption {
  height: number;
  label: string;
  ext: string;
  filesize: number | null;
}

/** Link metadata shown before the user picks a quality (see `probeMedia`). */
export interface MediaProbe {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  video: VideoOption[];
}

/** Inspect a link without downloading: title/thumbnail/duration + MP4 qualities. */
export function probeMedia(url: string): Promise<MediaProbe> {
  return invoke<MediaProbe>("probe_media", { url });
}

/** MP3 bitrates offered in the Audio tab (ffmpeg transcode targets, kbps). */
export const MP3_BITRATES = [320, 256, 192, 128, 96, 64] as const;

/** Estimated MP3 byte size from duration (s) and bitrate (kbps); null if unknown. */
export function mp3SizeEstimate(durationSec: number | null, kbps: number): number | null {
  if (!durationSec) return null;
  return Math.round((durationSec * kbps * 1000) / 8);
}

/** Live download progress; `total` is null until the source size is known. */
export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number | null;
}

/**
 * Download a URL via the bundled yt-dlp sidecar; returns the saved path.
 * `opts.height` caps the MP4 resolution; `opts.audioBitrate` sets the MP3 kbps.
 * `onProgress` (optional) is called with live progress over a Tauri channel.
 */
export function downloadMedia(
  url: string,
  format: DownloadFormat,
  opts?: { height?: number; audioBitrate?: number },
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const channel = new Channel<DownloadProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return invoke<string>("download_media", {
    url,
    format,
    height: opts?.height,
    audioBitrate: opts?.audioBitrate,
    onProgress: channel,
  });
}
