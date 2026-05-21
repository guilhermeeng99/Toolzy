# Image Conversion Feature Spec

> **Status**: In progress. Canvas path shipped (PNG/JPG/WebP, resize, quality, batch/ZIP); AVIF/JXL via jSquash pending.
> **Last updated**: 2026-05-21
> **Coverage**: Formats, Engine contract, Business rules, Options, Threading, UI, Edge cases, Testing
> **Environment**: browser (also runs in desktop build unchanged)

Convert, compress, and resize raster images entirely in the browser. Drop one or many
files, pick a target format and options, get the results back — nothing is uploaded. This is
the MVP that proves the architecture end-to-end (registry → Worker → WASM → download).

**Scope decisions** (locked at design time):

- **Raster only**: PNG, JPG, WebP, AVIF, JPEG-XL in V1. Vector (SVG) and exotic formats are
  later/other specs.
- **Client-side only**: no server path, ever (ADR-001). Backed by Canvas + jSquash; broad
  formats (TIFF/GIF/BMP/HEIC-in) come via wasm-vips when that demand lands.
- **One pipeline for convert + compress + resize**: they are options of a single image
  converter, not three tools.
- **Batch in, ZIP out**: multiple files convert in sequence and download individually or as
  one ZIP.
- **No editing** (crop/rotate/filters) in V1 — backlog (see §9).

---

## 1. Supported Formats

Decode (in) and encode (out) for V1:

| From ↓ \ To → | PNG | JPG | WebP | AVIF | JPEG-XL |
|---|---|---|---|---|---|
| PNG  | ✅ | ✅ | ✅ | ✅ | ✅ |
| JPG  | ✅ | ✅ | ✅ | ✅ | ✅ |
| WebP | ✅ | ✅ | ✅ | ✅ | ✅ |
| AVIF | ✅ | ✅ | ✅ | ✅ | ✅ |
| JPEG-XL | ✅ | ✅ | ✅ | ✅ | ✅ |

Backing engine per format:

- **PNG / JPG / WebP** — Canvas API (`createImageBitmap` + `OffscreenCanvas.convertToBlob`)
  for decode/encode; fast, zero extra payload.
- **AVIF / JPEG-XL** — `@jsquash/avif`, `@jsquash/jxl` (WASM) for encode, and for decode when
  the browser lacks native support.
- **Compression quality** — jSquash encoders (mozjpeg/webp/avif/jxl) expose real quality
  knobs; PNG uses OxiPNG (`@jsquash/oxipng`) for lossless optimization.

Size cap: **`maxBytes = 100 MB`** per input file in V1 (configurable). Larger → `file_too_large`.

---

## 2. Engine Contract

```ts
// packages/engine/src/image/converter.ts
export interface ImageOptions {
  quality?: number;        // 1..100, lossy formats only. Default 80.
  resize?: {
    mode: 'none' | 'px' | 'percent';
    width?: number;        // px mode: target width
    height?: number;       // px mode: target height
    percent?: number;      // percent mode: 1..100
    keepAspectRatio: boolean; // default true
  };
  pngOptimize?: boolean;   // OxiPNG pass for PNG output. Default true.
}

export const imageConverter: Converter<ImageOptions> = {
  id: 'image',
  inputs: ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/jxl'],
  outputs: ['png', 'jpg', 'webp', 'avif', 'jxl'],
  environment: 'both',
  async convert(file, target, options, ctx) { /* Result<ConversionOutput> */ },
};
```

Pipeline inside `convert`:

1. Validate size (`file.size <= maxBytes`) → else `file_too_large`.
2. Decode to `ImageData` (Canvas for native formats; jSquash decode for AVIF/JXL when
   needed) → on failure `decode_failed`.
3. Apply resize (if `mode !== 'none'`) → compute target dims (respect `keepAspectRatio`).
4. Encode to `target` with `quality` (jSquash) or Canvas; PNG runs OxiPNG if `pngOptimize`.
   → on failure `encode_failed`.
5. Report `ctx.onProgress` at decode/resize/encode boundaries; check `ctx.signal` between
   steps → `canceled` if aborted.
6. Return `{ blob, format: target, filename, bytes }`.

Errors this converter can return: `file_too_large`, `unsupported_format`, `decode_failed`,
`encode_failed`, `worker_failed`, `canceled`.

Runs inside the shared Web Worker. Codec WASM is lazy-loaded on first use of a format that
needs it (AVIF/JXL/OxiPNG), not at page load.

---

## 3. Business Rules

1. **Convert** — output format is the user-selected `target`; extension and MIME match the
   real encoded bytes (never just a renamed file).
2. **Quality applies to lossy targets only** (JPG/WebP/AVIF/JXL). For PNG, the quality
   control is hidden; `pngOptimize` (lossless) is offered instead.
3. **Default quality is 80.** Range clamped to `1..100`.
4. **Resize `none` (default)** keeps original dimensions.
5. **Resize `percent`** scales both dimensions by `percent` (1..100), aspect ratio implicitly
   preserved.
6. **Resize `px` with `keepAspectRatio = true`** — if both width and height are given, fit
   within the box (the smaller scale factor wins); if only one is given, the other is derived.
7. **Resize `px` with `keepAspectRatio = false`** — stretch to exact width×height.
8. **Never upscale silently past 100%/native** unless the user explicitly enters larger
   dimensions; default UI never upscales.
9. **Same-format "convert"** is allowed (acts as compress/resize/optimize in place).
10. **Output filename** = original base name + new extension (e.g. `photo.png` → `photo.jpg`).
    Collisions in batch are de-duplicated (`photo (1).jpg`).
11. **Batch processes sequentially**; one file failing does not abort the rest — failed items
    are listed with their `ToolzyError`, successful ones remain downloadable.
12. **EXIF/orientation**: respect EXIF orientation on decode so rotated photos export upright.
    (Stripping/keeping metadata is a backlog option, §9.)
13. **Transparency**: converting a transparent source (PNG/WebP/AVIF) to JPG (no alpha)
    flattens onto a white background; warn in the UI.

---

## 4. Options & Defaults

| Option | Type | Range | Default | Notes |
|---|---|---|---|---|
| target | enum | png/jpg/webp/avif/jxl | — | required |
| quality | int | 1..100 | 80 | lossy targets only |
| pngOptimize | bool | — | true | PNG target only (OxiPNG) |
| resize.mode | enum | none/px/percent | none | |
| resize.width / height | int px | > 0 | — | px mode |
| resize.percent | int | 1..100 | — | percent mode |
| resize.keepAspectRatio | bool | — | true | |

The UI disables/hides invalid combinations (e.g. quality for PNG); the engine re-validates
defensively and returns the matching `ToolzyError` if called with a bad combination.

---

## 5. Threading / Performance

- All decode/encode runs in the Web Worker; the main thread only marshals files and renders
  progress.
- Lazy-load: `@jsquash/avif`, `@jsquash/jxl`, `@jsquash/oxipng` fetched on first use.
- Free `ImageBitmap`/`OffscreenCanvas` and revoke object URLs after each file to bound memory
  during batch runs.
- `file_too_large` is checked **before** decode to avoid OOM.
- Progress is per-file (0..1); batch progress = files done / total.

---

## 6. UI States

```
Idle ──drop/select files──▶ Ready(files[], options)
Ready ──change options──▶ Ready (re-render, no work yet)
Ready ──"Convert"──▶ Converting(index, progress)
Converting ──all done──▶ Done(results[], failures[])
Converting ──cancel──▶ Ready (discard in-flight output)
Converting ──fatal worker error──▶ Error(worker_failed)
Done ──"Convert more" / drop again──▶ Ready
```

Layout:

- **Drop zone** (empty state): drag-and-drop or click to select; accepts the `inputs` MIME
  list; shows the size cap.
- **File list**: thumbnail, name, original size; per-file remove.
- **Options panel**: target format, quality slider (live), resize controls, PNG optimize
  toggle. Quality hidden for PNG; JPG-from-transparent shows the flatten warning (rule 13).
- **Convert bar**: primary action; disabled until ≥1 file + valid options.
- **Results**: per file → thumbnail, new size + delta (e.g. `−72%`), Download. Plus
  **Download all (ZIP)**. Failures shown inline with a localized reason.

---

## 7. Edge Cases

| Scenario | Expected behavior |
|---|---|
| Drop a non-image / unsupported type | Rejected at the drop zone; `unsupported_format` toast |
| File over 100 MB | `file_too_large`; not decoded; row marked failed |
| Corrupt / truncated image | `decode_failed`; other batch files continue |
| Encode fails (e.g. JXL WASM load error) | `encode_failed`; row failed, rest continue |
| Cancel mid-batch | Current + remaining stop; already-finished results kept |
| PNG target + quality set via API | Quality ignored (lossless); no error |
| Transparent → JPG | Flatten to white, UI warned beforehand |
| Resize to exact box, keepAspectRatio | Fit inside box; never distort |
| Upscale beyond native | Allowed only if user types larger dims; never by default |
| Same source & target format | Allowed; re-encodes with options (compress/resize) |
| Two inputs produce same output name | De-dupe: `name (1).ext` |
| EXIF-rotated photo | Exported upright (orientation applied) |
| Huge batch (e.g. 200 files) | Sequential; memory released per file; UI stays responsive |

---

## 8. Testing Checklist

- **Engine** (Vitest, real WASM where feasible; tiny fixture images):
  - [ ] every From→To pair in the matrix produces a valid, correctly-typed blob
  - [ ] quality affects output size for lossy targets; ignored for PNG
  - [ ] resize: percent, px keep-aspect (one dim / both dims), px stretch
  - [ ] no-upscale-by-default invariant
  - [ ] EXIF orientation applied
  - [ ] transparency→JPG flatten
  - [ ] cancellation returns `canceled` and yields no output
  - [ ] each `ToolzyError` kind (`file_too_large`, `unsupported_format`, `decode_failed`,
        `encode_failed`)
- **UI** (Vitest + Playwright):
  - [ ] drop → options → convert → download happy path
  - [ ] batch with one failing file: rest still succeed and download
  - [ ] Download-all ZIP contains every successful result
  - [ ] error rows render the localized message per kind
  - [ ] quality control hidden for PNG; flatten warning shown for transparent→JPG

---

## 9. Out of Scope (V1)

- **Editing**: crop, rotate, flip, filters, watermark — backlog.
- **Metadata controls**: strip/keep EXIF, set DPI — backlog option.
- **SVG / vector** input or output — separate spec.
- **TIFF / GIF / BMP / HEIC** decode — add via `wasm-vips` when demand appears (rule of
  thumb: ship Canvas+jSquash first, pull in wasm-vips only when the format matrix needs it).
- **Animated** WebP/AVIF/GIF handling — backlog (treat as first frame for now, with a UI note).
