import {
  type ConversionOutput,
  type ConvertContext,
  MAX_PDF_BYTES,
  type PdfToImagesOptions,
  type Result,
  err,
  errors,
  ok,
  padPageName,
} from "@toolzy/engine";

// pdf.js renders pages to a canvas. It spins its own parsing worker, served from
// /pdf.worker.min.mjs (copied by scripts/copy-pdf-worker.mjs).
let workerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerConfigured = true;
  }
  return pdfjs;
}

function clampScale(scale?: number): number {
  return Math.min(4, Math.max(1, scale ?? 2));
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: "png" | "jpg",
  quality?: number,
): Promise<Blob> {
  const type = format === "jpg" ? "image/jpeg" : "image/png";
  const q = format === "jpg" ? Math.min(100, Math.max(1, quality ?? 85)) / 100 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, q);
  });
}

export async function pdfToImages(
  file: File | Blob,
  options: PdfToImagesOptions,
  ctx?: ConvertContext,
): Promise<Result<ConversionOutput[]>> {
  if (file.size > MAX_PDF_BYTES) return err(errors.fileTooLarge(file.size, MAX_PDF_BYTES));

  const pdfjs = await loadPdfjs();
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (cause) {
    return err(errors.decodeFailed("pdf", cause));
  }

  try {
    const scale = clampScale(options.scale);
    const total = doc.numPages;
    const baseName = file instanceof File ? file.name.replace(/\.[^.]+$/, "") : "page";
    const ext = options.format === "jpg" ? "jpg" : "png";
    const outputs: ConversionOutput[] = [];

    for (let p = 1; p <= total; p += 1) {
      if (ctx?.signal?.aborted) return err(errors.canceled());
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) return err(errors.encodeFailed(options.format, "no 2D context"));

      await page.render({ canvasContext, viewport }).promise;
      const blob = await canvasToBlob(canvas, options.format, options.quality);
      outputs.push({
        blob,
        format: options.format,
        filename: padPageName(baseName, p, total, ext),
        bytes: blob.size,
      });
      page.cleanup();
      ctx?.onProgress?.(p / total);
    }

    return ok(outputs);
  } catch (cause) {
    return err(errors.encodeFailed(options.format, cause));
  } finally {
    await doc.destroy();
  }
}
