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

/** Source extensions for the audio *edit* modes (trim/volume/speed — audio only). */
export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "flac", "aac", "ogg"];

/** Convert/extract audio from a media file via the bundled ffmpeg sidecar. */
export function convertMedia(path: string, target: AudioTarget): Promise<string> {
  return invoke<string>("convert_media", { path, target });
}

/** Read a local media file's duration in seconds (ffmpeg). Feeds the trim UIs. */
export function probeDuration(path: string): Promise<number> {
  return invoke<number>("probe_duration", { path });
}

export type DownloadFormat = "mp4" | "mp3";
export type CookieBrowser = "brave" | "chrome" | "edge" | "firefox" | "";

export const COOKIE_BROWSERS: readonly { value: CookieBrowser; label: string }[] = [
  { value: "", label: "Do not use browser cookies" },
  { value: "chrome", label: "Google Chrome" },
  { value: "edge", label: "Microsoft Edge" },
  { value: "firefox", label: "Mozilla Firefox" },
  { value: "brave", label: "Brave" },
];

/** One downloadable MP4 quality; `filesize` is the merged video+audio byte estimate. */
export interface VideoOption {
  height: number | null;
  label: string;
  ext: string;
  filesize: number | null;
}

/** Link metadata shown before the user picks a quality (see `probeMedia`). */
export interface MediaProbe {
  title: string;
  thumbnail: string | null;
  duration: number | null;
  source: string;
  hasAudio: boolean;
  video: VideoOption[];
}

/** Expand one media/playlist URL to at most 100 canonical media URLs. */
export function expandMediaUrls(url: string, cookieBrowser: CookieBrowser): Promise<string[]> {
  return invoke<string[]>("expand_media_urls", {
    url,
    cookieBrowser: cookieBrowser || undefined,
  });
}

/** Inspect one link without downloading: source metadata + MP4 qualities. */
export function probeMedia(url: string, cookieBrowser: CookieBrowser): Promise<MediaProbe> {
  return invoke<MediaProbe>("probe_media", {
    url,
    cookieBrowser: cookieBrowser || undefined,
  });
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
  opts?: { height?: number; audioBitrate?: number; cookieBrowser?: CookieBrowser },
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const channel = new Channel<DownloadProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return invoke<string>("download_media", {
    url,
    format,
    height: opts?.height,
    audioBitrate: opts?.audioBitrate,
    cookieBrowser: opts?.cookieBrowser || undefined,
    onProgress: channel,
  });
}
