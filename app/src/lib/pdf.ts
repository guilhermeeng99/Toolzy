import { invoke } from "@tauri-apps/api/core";
import type { CompressLevel, CompressResult } from "./compress";

export type { CompressLevel, CompressResult };

export type PdfImageFormat = "png" | "jpg";

/** Single source extension for the PDF tools (stable ref for `useSingleFile`). */
export const PDF_EXTENSIONS = ["pdf"] as const;

/** Render each PDF page to an image natively (pdfium); returns saved paths. */
export function pdfToImages(
  path: string,
  format: PdfImageFormat,
  scale: number,
): Promise<string[]> {
  return invoke<string[]>("pdf_to_images", { path, format, scale });
}

export type Rotation = 0 | 90 | 180 | 270;
export type PageSize = "fit" | "a4" | "letter" | "legal";
export type Orientation = "portrait" | "landscape";
export type Margin = "none" | "small" | "large";

/** One image to place in the PDF, with its clockwise rotation. */
export interface ImageItem {
  path: string;
  rotation: Rotation;
}

/** Page layout for images → PDF (the options panel). */
export interface ImagesPdfOptions {
  pageSize: PageSize;
  orientation: Orientation;
  margin: Margin;
  merge: boolean;
}

/** Combine images into PDF(s) natively (printpdf). Returns the saved path(s):
 *  one when merging, one per image otherwise. */
export function imagesToPdf(
  items: ImageItem[],
  options: ImagesPdfOptions,
  outPath: string,
): Promise<string[]> {
  return invoke<string[]>("images_to_pdf", { items, options, outPath });
}

/** Render a preview of an image or PDF (first page) as a PNG data URL. */
export function makeThumbnail(path: string): Promise<string> {
  return invoke<string>("make_thumbnail", { path });
}

/** Concatenate PDFs into one, in list order (qpdf); returns the saved path. */
export function mergePdfs(paths: string[], outPath: string): Promise<string> {
  return invoke<string>("merge_pdfs", { paths, outPath });
}

/** Shrink a PDF by re-rasterizing pages at `level` (pdfium + printpdf). */
export function compressPdf(
  path: string,
  outPath: string,
  level: CompressLevel,
): Promise<CompressResult> {
  return invoke<CompressResult>("compress_pdf", { path, outPath, level });
}

/** Add an open password (AES-256) to a PDF (qpdf); returns the saved path. */
export function addPdfPassword(path: string, password: string, outPath: string): Promise<string> {
  return invoke<string>("add_pdf_password", { path, password, outPath });
}

/** Remove a known password from a PDF (qpdf); returns the saved path. */
export function removePdfPassword(
  path: string,
  password: string,
  outPath: string,
): Promise<string> {
  return invoke<string>("remove_pdf_password", { path, password, outPath });
}
