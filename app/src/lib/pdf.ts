import { invoke } from "@tauri-apps/api/core";

export type PdfImageFormat = "png" | "jpg";

/** Render each PDF page to an image natively (pdfium); returns saved paths. */
export function pdfToImages(
  path: string,
  format: PdfImageFormat,
  scale: number,
): Promise<string[]> {
  return invoke<string[]>("pdf_to_images", { path, format, scale });
}

/** Combine images into a single PDF natively (printpdf); returns the saved path. */
export function imagesToPdf(paths: string[], outPath: string): Promise<string> {
  return invoke<string>("images_to_pdf", { paths, outPath });
}
