# Image Conversion Feature Spec

> **Status**: Shipped (native). PNG/JPG/WebP/GIF/BMP/TIFF + resize/quality, batch, drag-drop.
> AVIF/JPEG-XL planned.
> **Last updated**: 2026-05-22
> **Environment**: desktop (native)

Convert and resize images natively on the user's machine. Pick or drop one or many files,
choose a target format and options; each file is read, converted in Rust, and written beside
the source. Nothing is uploaded.

**Scope decisions:**

- **Raster only.** PNG, JPG, WebP, GIF, BMP, TIFF today; AVIF/JPEG-XL later.
- **Native.** `image` crate for decode + most encodes; `webp` crate (libwebp) for lossy WebP.
- **Batch in / files out.** Multiple files convert sequentially; each gets its own status.
- **No editing** (crop/rotate/filters) in V1.

---

## 1. Supported Formats

Decode: anything `image` reads (incl. webp/avif/ico input). Encode (targets): `png`, `jpg`,
`webp`, `gif`, `bmp`, `tiff`. The picker also accepts `jpeg`/`tif`/`ico` as input; `ico` is
**decode-only** (not an output target).

- **png / gif / bmp / tiff** — `image` crate, lossless.
- **jpg** — `image` `JpegEncoder` with quality (drops alpha; no transparency).
- **webp** — `webp` crate (libwebp), lossy with quality.
- **avif / jxl** — planned (`ravif` / `jpegxl-rs`; heavy native encoders).

---

## 2. Engine Contract (Rust command)

```rust
// app/src-tauri/src/image_convert.rs (command + pure helpers, cargo-tested)
#[derive(Deserialize)] struct ResizeOpt {           // serde rename_all = camelCase
  mode: String,            // "none" | "px" | "percent"
  width: Option<u32>, height: Option<u32>,
  percent: Option<f32>, keep_aspect_ratio: bool,
}
#[derive(Serialize)] struct ConvertResult { path: String, in_bytes: u64, out_bytes: u64 }

#[tauri::command]
fn convert_image(
  path: String, target: String, quality: Option<u8>, resize: Option<ResizeOpt>,
) -> Result<ConvertResult, String>;
```

- Reads `path`, applies resize (Lanczos3), encodes to `target`, writes `base.<ext>` beside the
  source, returns the path + byte sizes.
- Errors are short strings: `open failed`, `decode failed`, `encode failed`, `unsupported target`.
- Pure helpers `target_dimensions` / `output_path` are unit-tested (`cargo test`).

UI wrapper: `app/src/lib/convert.ts` → `invoke<ConvertResult>("convert_image", …)`.

---

## 3. Business Rules

1. **Output format** = `target`; extension matches the encoded bytes.
2. **Quality** applies to lossy targets (`jpg`, `webp`), 1..100, default 80; ignored otherwise.
3. **Resize `none`** keeps source size; **`percent`** scales by 1..100 (capped — no upscale);
   **`px` keep-aspect** fits within the box (one dim derives the other); **`px` no keep-aspect**
   stretches to exact W×H. Never below 1px.
4. **Output filename** = source base name + new extension, written in the source directory.
5. **JPG from a transparent source** drops alpha (no transparency in JPEG).
6. **Batch** runs sequentially; one failure doesn't stop the rest — each row shows its result.

---

## 4. UI (`Image` tab)

- Options card: target pills, quality slider (lossy only), resize (none/percent/px + keep-aspect).
- Drop zone: native OS drag-drop or click → multi-select. Accepts the image extensions.
- File list: per file → name, status (Working/Done), and `in → out` size with a delta. Clear.

---

## 5. Edge Cases

| Scenario | Expected |
|---|---|
| Non-image / unsupported target | `Err` on that row; others continue |
| Corrupt image | `decode failed` on that row |
| Same source & target format | re-encodes (acts as compress/resize) |
| Huge batch | sequential; each row independent |

---

## 6. Testing Checklist

- **Rust (unit)**: `target_dimensions` (percent cap, px keep-aspect one/both dims, stretch,
  min 1px), `output_path` extension swap. (Decode/encode verified via real runs.)
- **Manual**: each target produces a valid file; quality affects jpg/webp size; resize modes.

---

## 7. Out of Scope (V1)

- AVIF / JPEG-XL output (planned). Editing (crop/rotate/filters). Metadata controls. Animated
  output. SVG/vector.
