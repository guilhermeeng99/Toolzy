# PDF Tools Feature Spec

> **Status**: Shipped (native). PDF→images · Images→PDF · Merge · Compress · Protect · Unlock.
> **Last updated**: 2026-05-22
> **Environment**: desktop (native)

Six related tools, all native and on-device, grouped under the **PDF** tab:

1. **PDF to images** — render each page to a PNG or JPG.
2. **Images to PDF** — combine images into one multi-page PDF, user-ordered (drag-reorder + rotate).
3. **Merge PDFs** — concatenate several PDFs into one, user-ordered.
4. **Compress PDF** — shrink a PDF by re-rasterizing pages at a chosen level.
5. **Protect PDF** — add an open password (AES-256).
6. **Unlock PDF** — remove a known password.

**Scope decisions** (locked at design time):

- **Native, no AGPL.** `pdfium-render` rasterizes; `printpdf` writes PDFs; **`qpdf`** (a
  **sidecar**, Apache-2.0) does the structural + crypto work (merge, encrypt, decrypt).
  Ghostscript / MuPDF are AGPL → excluded (see [ADR-005](architecture.md#adr-005-library--license-choices)).
- **Why qpdf is a sidecar, not a crate.** The only viable Rust crate (`lopdf`) reads PDFs with
  *empty* passwords only — it does not decrypt arbitrary passwords nor re-encrypt to AES-256.
  Robust PDF crypto has no good crate → fall back to a sidecar (CLAUDE.md → "compiled-in crate;
  fall back to a sidecar when a crate isn't viable"). See [ADR-009](architecture.md#adr-009-qpdf-sidecar-for-pdf-merge--encryption).
- **Compress is lossy (rasterize).** Each page is rendered to an image and re-embedded as JPEG.
  This gives real, tunable size control but **flattens text to pixels** (no longer
  selectable/searchable) — best for scanned / image-heavy PDFs. A lossless "keep text" mode is
  out of scope V1.
- **Merge orders whole files** (drag to reorder); pages flow in file order. Page-level
  reorder / interleave is out of scope V1.
- **Distinct modes**, not one mega-converter: Images→PDF and Merge PDFs stay separate (one
  takes images, one takes PDFs).

---

## 1. Formats

| Tool | In | Out |
|---|---|---|
| PDF → images | `application/pdf` | `png` \| `jpg` (one per page) |
| Images → PDF | png/jpg/webp/gif/bmp/tiff | one `application/pdf` |
| Merge PDFs | 2+ `application/pdf` | one `application/pdf` |
| Compress PDF | `application/pdf` | one `application/pdf` (smaller) |
| Protect PDF | `application/pdf` | one `application/pdf` (encrypted) |
| Unlock PDF | encrypted `application/pdf` | one `application/pdf` (decrypted) |

Engines: pdfium (render), printpdf (write images→pdf, compress rebuild), qpdf (merge, encrypt,
decrypt).

---

## 2. Engine Contract (Rust commands)

```rust
// pdf.rs — bind_pdfium() is pub(crate), reused by compress.
#[tauri::command]
fn pdf_to_images(app, path: String, format: String, scale: Option<f32>) -> Result<Vec<String>, String>;

// pdf_build.rs — per-image rotation + page size / orientation / margin / merge toggle
#[tauri::command]
fn images_to_pdf(items: Vec<ImageItem>, options: ImagesPdfOptions, out_path: String) -> Result<Vec<String>, String>;
// ImageItem { path, rotation:0|90|180|270 }; ImagesPdfOptions { pageSize:"fit"|"a4"|"letter"|"legal",
//   orientation:"portrait"|"landscape", margin:"none"|"small"|"large", merge:bool }
// Returns one path when merging, one per image otherwise. Images embed as JPEG (DCT, q88).

// thumbnail.rs — grid preview for an image or a PDF's first page, as a PNG data URL
#[tauri::command]
fn make_thumbnail(app, path: String) -> Result<String, String>;

// pdf_merge.rs — qpdf
#[tauri::command]
async fn merge_pdfs(app, paths: Vec<String>, out_path: String) -> Result<String, String>;

// pdf_compress.rs — pdfium + printpdf
#[tauri::command]
fn compress_pdf(app, path: String, out_path: String, level: String) -> Result<CompressResult, String>;

// pdf_protect.rs — qpdf
#[tauri::command]
async fn add_pdf_password(app, path: String, password: String, out_path: String) -> Result<String, String>;
#[tauri::command]
async fn remove_pdf_password(app, path: String, password: String, out_path: String) -> Result<String, String>;
```

- `CompressResult` (serde `rename_all = "camelCase"`): `{ path: String, before: u64, after: u64 }`
  — output path + source/result byte sizes (the UI shows the delta).
- **qpdf runner** (`qpdf.rs`): `run_qpdf(app, args) -> Result<(), String>` spawns the sidecar,
  passes `--warning-exit-0` (warnings still produce valid output), checks `status.success()`,
  returns the stderr tail on failure. The per-feature arg builders are **pure** and unit-tested.
- **qpdf arg shapes** (pure builders):
  - merge: `["--empty", "--pages", in1, in2, …, "--", out]`
  - encrypt: `["--encrypt", pw, pw, "256", "--", in, out]` (user = owner = the entered password)
  - decrypt: `["--password=" + pw, "--decrypt", "--", in, out]`
- **Compress level → render params** (pure `pdf_compress_params`):
  | level | page scale (≈dpi) | JPEG quality |
  |---|---|---|
  | `light` | 2.0 (~144) | 80 |
  | `balanced` | 1.5 (~108) | 65 |
  | `strong` | 1.0 (~72) | 50 |
- UI wrappers: `app/src/lib/pdf.ts`.
- **Engine versions / deferred upgrade** — `pdfium-render` is on 0.9 (runtime pdfium lib);
  `printpdf` is **held at 0.7**. printpdf 0.8/0.9 is a ground-up rewrite (`PdfDocument::new(str)`
  + `add_image`→`XObjectId` + `Op::UseXobject` + `Vec<Op>` pages; `ImageTransform`→
  `XObjectTransform`) and embeds images via `RawImage::decode_from_bytes` (which **decodes** the
  JPEG) instead of the current direct DCTDecode embed — this changes `compress_pdf`'s output size,
  so the bump is deferred until a visual smoke-test confirms parity.

---

## 3. Business Rules

1. **Page/file order preserved.** PDF→images names pages `name-01.png`… (zero-padded).
   Images→PDF and Merge follow the user-ordered list exactly.
2. **Scale** (PDF→images) clamps to 1..4 (default 2).
3. **Merge needs ≥1 file** (≥2 to be meaningful); empty → `Err("no PDFs provided")`.
4. **Compress** re-rasterizes every page at the level's scale, re-embeds as JPEG (DCTDecode),
   and reports before/after sizes. Output page keeps the source page's physical size.
5. **Protect** encrypts with AES-256; a non-empty password is required (`Err("password required")`).
6. **Unlock** decrypts with the supplied password; a wrong password → `Err` with a friendly
   "incorrect password" message (qpdf exits non-zero).
7. **Empty selection / missing input** → the action is disabled in the UI and re-checked in Rust.
8. **Passwords are never logged** and are passed only to the qpdf process args.
9. **qpdf/pdfium missing** → a clear `Err` ("qpdf not found", "pdfium library not found").
10. **Images → PDF layout.** Each image is rotated (0/90/180/270); for a fixed page
    (A4/Letter/Legal × portrait/landscape) it is fitted inside the margins (none/small/large)
    and centred, while `fit` sizes the page to the image. `merge` off → one `<stem>-N.pdf` per
    image. Images embed as JPEG (DCT, q88) to keep the PDF small.
11. **Previews & reorder.** Grid pickers show a native thumbnail per file (`make_thumbnail`,
    PNG data URL — cheap over IPC) and reorder by **pointer drag** (dnd-kit), since the webview's
    OS file-drop handler swallows HTML5 drag events.

---

## 4. Options & Defaults

| Tool | Option | Type | Default | Effect |
|---|---|---|---|---|
| PDF → images | format | `png`\|`jpg` | `png` | output image type |
| PDF → images | scale | 1..4 | 2 | render resolution |
| Images → PDF | order | drag-reorder | add order | page order |
| Images → PDF | rotation (per image) | 0/90/180/270 | 0 | clockwise rotate |
| Images → PDF | page size | `fit`\|`a4`\|`letter`\|`legal` | `a4` | page dimensions (`fit` = size to image) |
| Images → PDF | orientation | `portrait`\|`landscape` | `portrait` | swaps page w/h (ignored for `fit`) |
| Images → PDF | margin | `none`\|`small`\|`large` | `none` | 0/10/25 mm inset (ignored for `fit`) |
| Images → PDF | merge | bool | `true` | one PDF vs one per image |
| Merge PDFs | order | drag-reorder | add order | concatenation order |
| Compress | level | `light`\|`balanced`\|`strong` | `balanced` | scale + JPEG quality (size vs quality) |
| Protect | password | string | — | open password (required, non-empty) |
| Unlock | password | string | — | current password (required) |

Outputs (merge/compress/protect/unlock) go through a native **save** dialog with a smart
default name (`*-merged.pdf`, `*-compressed.pdf`, `*-protected.pdf`, `*-unlocked.pdf`).

---

## 5. Threading / Performance

- qpdf commands are `async` (await `.output()`); compress is a sync command (pdfium renders
  synchronously) and runs off the UI thread on Tauri's command pool.
- Compress holds one rendered page in memory at a time; large/many pages are slower but bounded.
- No cancellation V1 (operations are short for typical files); the UI shows a busy state.

---

## 6. UI States

The **PDF** tab is a mode switcher (pills): _PDF→images · Images→PDF · Merge · Compress ·
Protect · Unlock_. Each mode is its own component under `components/pdf/`.

```
Idle → (pick / drop) → Ready → Running(busy) → Done(saved path) | Error(message)
```

- **Preview grid** (Images→PDF, Merge): a thumbnail card per file (image / PDF first page via
  `make_thumbnail`) with an order badge; **pointer-drag to reorder** (dnd-kit), hover to rotate
  (images) / remove; a toolbar adds files and clears. Empty state is the drop zone.
  Images→PDF adds a right-side **options panel** (page size, orientation, margin, merge toggle).
- **Compress**: level pills + before/after size with delta (`formatBytes` / `sizeDelta`).
- **Protect / Unlock**: a password field (required) + save dialog.
- **Error**: the `Err(String)` message shown inline (incorrect password, missing binary, …).

---

## 7. Edge Cases

| Scenario | Expected |
|---|---|
| pdfium library missing | `Err("pdfium library not found …")` |
| qpdf sidecar missing | `Err` (qpdf not found) |
| Corrupt PDF | `decode failed` / qpdf error tail |
| Merge with <2 files | UI disables run; engine errors on empty |
| Compress a text-only PDF | works, but text becomes images (documented trade-off) |
| Wrong password on Unlock | `Err("incorrect password …")` |
| Empty password on Protect | UI disables run; engine errors |
| Encrypted input to Merge/Compress | fails (`decode failed`); user unlocks first |
| Non-image dropped into Images→PDF | filtered out |

---

## 8. Testing Checklist

- **Rust** (`cargo test`):
  - [ ] qpdf arg builders: merge / encrypt / decrypt produce the expected token order
  - [ ] `pdf_compress_params` maps each level to the right (scale, quality) and is monotonic
  - [ ] `pdf_compress_params` falls back to `balanced` for an unknown level
- **Manual / runtime** (needs pdfium + the qpdf sidecar):
  - [ ] merge N PDFs in a chosen order → one PDF with pages in that order
  - [ ] compress at each level → smaller file; before/after shown
  - [ ] protect → file requires the password to open; unlock with it → opens freely
  - [ ] wrong unlock password → friendly error in the UI

---

## 9. Out of Scope (this version)

- Lossless / "keep text" compression (qpdf `--optimize-images`); page-level reorder & split;
  per-page extraction; mixed images+PDFs in one combine flow.
- Per-page JPG quality control (PDF→images uses a sensible default).
- Permission-only (owner) passwords distinct from the open password; certificate encryption.
- OCR / text extraction.
