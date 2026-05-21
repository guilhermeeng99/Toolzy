# PDF Tools Feature Spec

> **Status**: Draft (Phase 2)
> **Last updated**: 2026-05-21
> **Coverage**: Formats, Engine API, Business rules, Options, UI, Edge cases, Testing
> **Environment**: browser

Two related tools, both fully client-side:

1. **PDF to images**: render each page of a PDF to a PNG or JPG.
2. **Images to PDF**: combine one or more images into a single multi-page PDF.

**Scope decisions** (locked):

- **Client-side only** (ADR-001). `pdfjs-dist` renders pages; `pdf-lib` writes PDFs.
- **These are not 1:1 converters.** PDF to images is one-to-many; images to PDF is
  many-to-one. They do **not** implement the `Converter` interface (which is 1:1). They are
  dedicated engine functions that still return `Result<…, ToolzyError>` and reuse the error
  model. The registry/`Converter` stays reserved for true 1:1 conversions — currently just
  the image converter. (Media is likewise a dedicated function, not a registry entry, because
  its ffmpeg runtime is bundler-coupled — see `media-convert.md`.)
- **Rendering runs on the main thread** in V1 (pdfjs spins its own parsing worker). Heavy
  documents are acceptable; a dedicated worker can come later.
- **No cmap/standard-font bundling** in V1: most Latin PDFs render correctly; exotic
  embedded encodings may fall back. Noted as a limitation.

---

## 1. Formats

**PDF to images**: in `application/pdf` → out `png` | `jpg`, one image per page.
**Images to PDF**: in `image/png` | `image/jpeg` (also `image/webp`, rasterized) → out one
`application/pdf`.

Size caps: PDF in ≤ 200 MB; each image ≤ 100 MB (`MAX_IMAGE_BYTES`).

---

## 2. Engine API

```ts
// packages/engine/src/pdf/
export interface PdfToImagesOptions {
  format: "png" | "jpg";
  scale?: number;        // render scale, default 2 (≈ 144 DPI). 1..4.
  quality?: number;      // jpg only, 1..100, default 85
}

export function pdfToImages(
  file: File | Blob,
  options: PdfToImagesOptions,
  ctx?: ConvertContext,
): Promise<Result<ConversionOutput[]>>; // one ConversionOutput per page

export interface ImagesToPdfOptions {
  pageSize: "fit" | "a4" | "letter"; // "fit" = page matches each image
  margin?: number;                    // pt, default 0
  orientation?: "portrait" | "landscape"; // for a4/letter
}

export function imagesToPdf(
  files: Array<File | Blob>,
  options: ImagesToPdfOptions,
  ctx?: ConvertContext,
): Promise<Result<ConversionOutput>>;
```

- Heavy deps (`pdfjs-dist`, `pdf-lib`) are **dynamically imported** inside the functions so
  the engine entrypoint stays light (Node unit tests never load them).
- `pdfToImages` reports `ctx.onProgress` as pages render (page/total); honors `ctx.signal`.
- Errors: `file_too_large`, `decode_failed` (corrupt/encrypted PDF), `encode_failed`,
  `unsupported_format`, `canceled`.

---

## 3. Business Rules

1. **Page order preserved**; output filenames are `name-001.png`, `name-002.png`, …
   (zero-padded to page count).
2. **Encrypted/password PDFs**: V1 does not prompt for a password; a protected PDF returns
   `decode_failed` with a clear message.
3. **Scale** clamps to `1..4`. Default 2.
4. **Images to PDF order** follows the user-arranged list order.
5. **`pageSize: "fit"`** makes each PDF page exactly the image's pixel size (at 72 dpi);
   `a4`/`letter` centers the image within the page minus margins, preserving aspect ratio.
6. **WebP/odd inputs**: rasterized via canvas to PNG before embedding (pdf-lib embeds
   PNG/JPG only).
7. **Empty selection**: actions are disabled; calling with an empty list returns
   `unsupported_format`.

---

## 4. UI (`/tools/pdf`)

A single page with two modes (tabs): "PDF to images" and "Images to PDF".

- **PDF to images**: drop one PDF → choose format/scale → Convert → page grid with
  per-page download + Download all (ZIP).
- **Images to PDF**: drop images → reorder (drag) → choose page size → Create PDF →
  download. Reorder can be simple up/down in V1.
- Same privacy messaging and Calendly design language as the image tool.

---

## 5. Edge Cases

| Scenario | Expected |
|---|---|
| Corrupt or encrypted PDF | `decode_failed`, friendly message |
| PDF over size cap | `file_too_large` |
| Cancel mid-render | `canceled`; already-rendered pages kept |
| Huge PDF (many pages) | sequential render, progress, memory released per page |
| Non-image dropped into "Images to PDF" | filtered out with a notice |
| Single image to PDF | valid one-page PDF |

---

## 6. Testing Checklist

- **Engine** (unit, pure helpers): filename zero-padding, page-size math, options clamping.
- **Engine** (integration, where feasible): a tiny generated PDF renders N pages; images to
  PDF produces a parseable PDF (pdf-lib load round-trip).
- **UI** (Playwright): drop sample → convert → download path for both modes.

---

## 7. Out of Scope (V1)

- Password-protected PDF input.
- PDF compression / split / merge / reorder pages (separate later specs).
- OCR / text extraction.
- cmap and standard-font data bundling (exotic font fallback accepted for now).
