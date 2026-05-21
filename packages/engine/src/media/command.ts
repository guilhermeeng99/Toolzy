import type { AudioTarget } from "./types";

/** Codec args per target. `aac` is ffmpeg's native encoder (no external lib). */
const AUDIO_CODEC: Record<AudioTarget, string[]> = {
  mp3: ["-acodec", "libmp3lame", "-q:a", "2"],
  m4a: ["-acodec", "aac", "-b:a", "192k"],
  wav: ["-acodec", "pcm_s16le"],
};

/** ffmpeg args to extract/convert audio. `-vn` drops any video stream. */
export function buildAudioArgs(input: string, output: string, target: AudioTarget): string[] {
  return ["-i", input, "-vn", ...AUDIO_CODEC[target], output];
}

/** Swap the extension; fall back to "audio" for empty names. */
export function audioOutputName(inputName: string, target: AudioTarget): string {
  const base = inputName.replace(/\.[^./\\]+$/, "") || "audio";
  return `${base}.${target}`;
}
