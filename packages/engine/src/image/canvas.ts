import { computeTargetDimensions } from "./dimensions";
import { type ImageOptions, type ImageTarget, LOSSY_TARGETS, TARGET_MIME } from "./types";

/**
 * Canvas-based image pipeline (no WASM). Runs anywhere `createImageBitmap` and
 * `OffscreenCanvas` exist: a Web Worker or the main thread.
 */

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  // `from-image` applies EXIF orientation so rotated photos export upright.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function encodeImage(
  bitmap: ImageBitmap,
  target: ImageTarget,
  options: ImageOptions,
): Promise<Blob> {
  const dims = computeTargetDimensions(
    { width: bitmap.width, height: bitmap.height },
    options.resize,
  );

  const canvas = new OffscreenCanvas(dims.width, dims.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  // JPEG has no alpha channel; flatten transparency onto white (spec rule 13).
  if (target === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dims.width, dims.height);
  }
  ctx.drawImage(bitmap, 0, 0, dims.width, dims.height);

  const quality = LOSSY_TARGETS.has(target) ? normalizeQuality(options.quality) : undefined;
  return canvas.convertToBlob({ type: TARGET_MIME[target], quality });
}

/** UI uses 1..100; Canvas wants 0..1. */
function normalizeQuality(q?: number): number {
  const v = q ?? 80;
  return Math.min(100, Math.max(1, v)) / 100;
}
