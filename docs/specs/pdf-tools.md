# PDF Tools Feature Spec

> **Status**: Shipped (native). PDF→images (pdfium) + images→PDF (printpdf).
> **Last updated**: 2026-05-21
> **Environment**: desktop (native)

Two related tools, both native and on-device:

1. **PDF to images** — render each page to a PNG or JPG.
2. **Images to PDF** — combine images into one multi-page PDF.

**Scope decisions:**

- **Native.** `pdfium-render` rasterizes pages; `printpdf` writes PDFs (pure Rust).
- **pdfium is runtime-loaded** — a prebuilt dynamic library beside the executable (fall back to
  a system install). Fetched/placed via `scripts/fetch-binaries.mjs`.
- Distinct commands (not a single 1:1 converter): one-to-many and many-to-one.

---

## 1. Formats

- **PDF → images**: in `application/pdf` → out `png` | `jpg`, one image per page.
- **Images → PDF**: in png/jpg/webp/gif/bmp/tiff → out one `application/pdf`.

---

## 2. Engine Contract (Rust commands)

```rust
// pdf.rs
#[tauri::command]
fn pdf_to_images(path: String, format: String, scale: Option<f32>) -> Result<Vec<String>, String>;

// pdf_build.rs
#[tauri::command]
fn images_to_pdf(paths: Vec<String>, out_path: String) -> Result<String, String>;
```

- `pdf_to_images`: binds pdfium (beside exe / system), renders each page at `scale` (1..4,
  default 2), saves `name-NN.<ext>` next to the PDF, returns the saved paths. Errors:
  `pdfium library not found`, `decode failed`, `encode failed`.
- `images_to_pdf`: one image per page at 72 dpi (page sized to the image), writes to
  `out_path` (chosen via a native save dialog), returns it. Errors: `no images provided`,
  decode/encode failures.

UI wrappers: `app/src/lib/pdf.ts`.

---

## 3. Business Rules

1. **Page order preserved**; output names `name-01.png`, `name-02.png`, … (zero-padded).
2. **Scale** clamps to 1..4 (default 2).
3. **Images → PDF order** follows the list order; one page per image at 72 dpi.
4. **Empty selection** → actions disabled; calling with none → `Err`.
5. **Encrypted / corrupt PDF** → `decode failed` with a clear message.

---

## 4. UI (`PDF` tab)

Two modes (tabs): **PDF to images** (choose a PDF, format png/jpg, scale; pages saved next to
the file) and **Images to PDF** (pick/drop images, reorder by add order, save dialog → PDF).

---

## 5. Edge Cases

| Scenario | Expected |
|---|---|
| pdfium library missing | `Err("pdfium library not found …")` — fetch it |
| Corrupt / encrypted PDF | `decode failed` |
| Non-image dropped into Images→PDF | filtered out |
| Single image | valid one-page PDF |

---

## 6. Testing Checklist

- **Manual / runtime**: a sample PDF renders N pages; images produce a parseable PDF. (pdfium
  needs the runtime library, so this is verified on a real build.)

---

## 7. Out of Scope (V1)

- Password-protected PDF input. Compress/split/merge/reorder pages. OCR / text extraction.
- Per-page JPG quality control (uses a sensible default).
