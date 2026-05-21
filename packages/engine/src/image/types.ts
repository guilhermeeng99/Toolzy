/** Image conversion formats and options. See docs/specs/image-conversion.md. */

/** Source MIME types the Canvas path reliably decodes in V1. */
export const IMAGE_INPUTS = ["image/png", "image/jpeg", "image/webp"] as const;

export const IMAGE_OUTPUTS = ["png", "jpg", "webp"] as const;
export type ImageTarget = (typeof IMAGE_OUTPUTS)[number];

export const TARGET_MIME: Record<ImageTarget, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export const TARGET_EXT: Record<ImageTarget, string> = {
  png: "png",
  jpg: "jpg",
  webp: "webp",
};

/** Targets that honor a quality setting (lossy). PNG is lossless. */
export const LOSSY_TARGETS: ReadonlySet<ImageTarget> = new Set<ImageTarget>(["jpg", "webp"]);

/** Per-file size cap, checked before decode to avoid OOM. */
export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;

export type ResizeMode = "none" | "px" | "percent";

export interface ResizeOptions {
  mode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  keepAspectRatio: boolean;
}

export interface ImageOptions {
  /** 1..100 for lossy targets. Default 80. */
  quality?: number;
  resize?: ResizeOptions;
}
