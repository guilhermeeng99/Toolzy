/** Media conversion options. ffmpeg runtime lives in apps/web/lib/media. */

/** 500 MB; WASM memory still bounds very large files at runtime. */
export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;

export const AUDIO_TARGETS = ["mp3", "m4a", "wav"] as const;
export type AudioTarget = (typeof AUDIO_TARGETS)[number];

/** `accept` attribute value for the file picker. */
export const MEDIA_ACCEPT = "audio/*,video/*";

export interface MediaConvertOptions {
  target: AudioTarget;
}
