import { invoke } from "@tauri-apps/api/core";

/** Source extensions accepted by the video edit modes. */
export const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "avi", "webm"];

/** Native video edits (ffmpeg sidecar). Single-file edits write beside the input;
 *  merge writes to a chosen path. See `docs/specs/video-edit.md`. */

/** Trim to `[start, end]` seconds, lossless → `base-trimmed.<ext>`. */
export function trimVideo(path: string, start: number, end: number): Promise<string> {
  return invoke<string>("trim_video", { path, start, end });
}

/** Concatenate `paths` (≥ 2, same format) into `out` (concat copy). */
export function mergeVideos(paths: string[], out: string): Promise<string> {
  return invoke<string>("merge_videos", { paths, out });
}

/** Replace the video's audio with `audio` → `base-audio.<ext>`. */
export function addAudioToVideo(video: string, audio: string): Promise<string> {
  return invoke<string>("add_audio_to_video", { video, audio });
}

/** Rotate clockwise by 90/180/270 → `base-rotated.<ext>`. */
export function rotateVideo(path: string, degrees: number): Promise<string> {
  return invoke<string>("rotate_video", { path, degrees });
}

/** Flip horizontally or vertically → `base-mirrored.<ext>`. */
export function mirrorVideo(path: string, direction: "horizontal" | "vertical"): Promise<string> {
  return invoke<string>("mirror_video", { path, direction });
}

/** Change speed by `factor` (0.5–2.0; needs an audio track) → `base-speed.<ext>`. */
export function changeVideoSpeed(path: string, factor: number): Promise<string> {
  return invoke<string>("change_video_speed", { path, factor });
}
