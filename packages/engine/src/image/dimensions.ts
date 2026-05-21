import type { ResizeOptions } from "./types";

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Compute output dimensions from the source size and resize options.
 * Implements docs/specs/image-conversion.md §3 rules 4-8. Never upscales via
 * percent mode (capped at 100%); px mode may upscale only if the caller passes
 * explicit larger dimensions.
 */
export function computeTargetDimensions(src: Dimensions, resize?: ResizeOptions): Dimensions {
  if (!resize || resize.mode === "none") return round(src);

  if (resize.mode === "percent") {
    const pct = clampPercent(resize.percent);
    return round({ width: src.width * pct, height: src.height * pct });
  }

  // mode === "px"
  if (!resize.keepAspectRatio) {
    return round({ width: resize.width ?? src.width, height: resize.height ?? src.height });
  }
  return round(fitKeepingAspect(src, resize.width, resize.height));
}

function fitKeepingAspect(src: Dimensions, width?: number, height?: number): Dimensions {
  const ratio = src.width / src.height;
  if (width != null && height != null) {
    // Fit inside the box: the smaller scale factor wins.
    const scale = Math.min(width / src.width, height / src.height);
    return { width: src.width * scale, height: src.height * scale };
  }
  if (width != null) return { width, height: width / ratio };
  if (height != null) return { width: height * ratio, height };
  return src;
}

function clampPercent(percent?: number): number {
  const p = percent ?? 100;
  return Math.min(100, Math.max(1, p)) / 100;
}

function round(d: Dimensions): Dimensions {
  return { width: Math.max(1, Math.round(d.width)), height: Math.max(1, Math.round(d.height)) };
}
