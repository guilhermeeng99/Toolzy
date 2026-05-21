import type { ImagesToPdfOptions } from "./types";

export interface ImageDims {
  width: number;
  height: number;
}

export interface PdfPageBox {
  pageW: number;
  pageH: number;
  x: number;
  y: number;
  drawW: number;
  drawH: number;
}

/** Point dimensions of named page sizes (portrait). */
const SIZES = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
} as const;

/**
 * Compute the PDF page box and the image draw rect. "fit" makes the page match
 * the image (1px = 1pt); a4/letter centers the image within the page minus
 * margins, preserving aspect ratio. Coordinates use pdf-lib's bottom-left origin
 * (centering is symmetric, so this works for both axes).
 */
export function computePdfPageBox(img: ImageDims, options: ImagesToPdfOptions): PdfPageBox {
  if (options.pageSize === "fit") {
    return { pageW: img.width, pageH: img.height, x: 0, y: 0, drawW: img.width, drawH: img.height };
  }

  const base = SIZES[options.pageSize];
  const landscape = options.orientation === "landscape";
  const pageW = landscape ? base.h : base.w;
  const pageH = landscape ? base.w : base.h;

  const margin = Math.max(0, options.margin ?? 0);
  const availW = Math.max(1, pageW - margin * 2);
  const availH = Math.max(1, pageH - margin * 2);

  const scale = Math.min(availW / img.width, availH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  return { pageW, pageH, x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, drawW, drawH };
}
