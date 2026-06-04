import { invoke } from "@tauri-apps/api/core";

export const IMAGE_TARGETS = ["png", "jpg", "webp", "gif", "bmp", "tiff"] as const;
export type ImageTarget = (typeof IMAGE_TARGETS)[number];

/** Targets that honor a quality setting (lossy). */
export const QUALITY_TARGETS = new Set<ImageTarget>(["jpg", "webp"]);

/** Source extensions accepted by the file picker / drag-drop. */
export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "tiff",
  "tif",
  "ico",
  "heic",
  "heif",
];

export type ResizeMode = "none" | "px" | "percent";

export interface ResizeOpt {
  mode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  keepAspectRatio: boolean;
}

export interface ConvertResult {
  path: string;
  inBytes: number;
  outBytes: number;
}

export interface ConvertImageArgs {
  path: string;
  target: ImageTarget;
  quality?: number;
  resize?: ResizeOpt;
}

/**
 * Convert an image file natively (Rust) and return the saved path + byte sizes.
 * The Rust command reads/writes the file directly — no bytes cross the IPC.
 */
export function convertImage(args: ConvertImageArgs): Promise<ConvertResult> {
  return invoke<ConvertResult>("convert_image", { ...args });
}
