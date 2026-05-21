import { invoke } from "@tauri-apps/api/core";

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

/** Download a URL as mp4/mp3 via the bundled yt-dlp sidecar; returns the saved path. */
export function downloadMedia(url: string, format: DownloadFormat): Promise<string> {
  return invoke<string>("download_media", { url, format });
}
