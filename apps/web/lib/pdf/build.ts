import {
  type ConversionOutput,
  type ConvertContext,
  type ImagesToPdfOptions,
  type Result,
  computePdfPageBox,
  err,
  errors,
  ok,
} from "@toolzy/engine";

/** pdf-lib embeds PNG/JPG only; rasterize anything else to PNG via canvas. */
async function toEmbeddable(
  file: File | Blob,
): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" }> {
  if (file.type === "image/jpeg")
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: "jpg" };
  if (file.type === "image/png")
    return { bytes: new Uint8Array(await file.arrayBuffer()), kind: "png" };

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D context");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "png" };
  } finally {
    bitmap.close();
  }
}

export async function imagesToPdf(
  files: Array<File | Blob>,
  options: ImagesToPdfOptions,
  ctx?: ConvertContext,
): Promise<Result<ConversionOutput>> {
  if (files.length === 0) return err(errors.unsupportedFormat("none", "pdf"));

  const { PDFDocument } = await import("pdf-lib");
  try {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (!file) continue;
      if (ctx?.signal?.aborted) return err(errors.canceled());

      const { bytes, kind } = await toEmbeddable(file);
      const img = kind === "jpg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      const box = computePdfPageBox({ width: img.width, height: img.height }, options);
      const page = pdf.addPage([box.pageW, box.pageH]);
      page.drawImage(img, { x: box.x, y: box.y, width: box.drawW, height: box.drawH });
      ctx?.onProgress?.((i + 1) / files.length);
    }

    const out = await pdf.save();
    const blob = new Blob([out as BlobPart], { type: "application/pdf" });
    return ok({ blob, format: "pdf", filename: "toolzy.pdf", bytes: blob.size });
  } catch (cause) {
    return err(errors.encodeFailed("pdf", cause));
  }
}
