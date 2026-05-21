/** PDF tool options. Implementations live in apps/web/lib/pdf (bundler-coupled). */

export const MAX_PDF_BYTES = 200 * 1024 * 1024;

export interface PdfToImagesOptions {
  format: "png" | "jpg";
  /** Render scale; 1..4, default 2 (~144 DPI). */
  scale?: number;
  /** jpg only, 1..100, default 85. */
  quality?: number;
}

export type PdfPageSize = "fit" | "a4" | "letter";

export interface ImagesToPdfOptions {
  pageSize: PdfPageSize;
  /** Page margin in points (a4/letter only). Default 0. */
  margin?: number;
  orientation?: "portrait" | "landscape";
}
