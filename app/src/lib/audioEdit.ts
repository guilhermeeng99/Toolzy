import { invoke } from "@tauri-apps/api/core";

/** Native audio edits (ffmpeg sidecar). Each writes a file beside the input and
 *  resolves with its path. See `docs/specs/audio-edit.md`. */

/** Trim to `[start, end]` seconds → `base-trimmed.<ext>`. */
export function trimAudio(path: string, start: number, end: number): Promise<string> {
  return invoke<string>("trim_audio", { path, start, end });
}

/** Scale volume by `percent` (0 mute, 100 unchanged, ≤ 400) → `base-volume.<ext>`. */
export function changeAudioVolume(path: string, percent: number): Promise<string> {
  return invoke<string>("change_audio_volume", { path, percent });
}

/** Change speed by `factor` (0.5–2.0, pitch kept) → `base-speed.<ext>`. */
export function changeAudioSpeed(path: string, factor: number): Promise<string> {
  return invoke<string>("change_audio_speed", { path, factor });
}
