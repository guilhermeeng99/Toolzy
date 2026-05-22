# Toolzy (desktop app)

The native desktop app: **Tauri 2 (Rust) · React + TypeScript + Vite · Tailwind v4 · pnpm**.
Rust is the engine (conversion runs natively); the React UI is a thin webview front-end.

Tools: **Image** (convert/resize, batch, drag-drop), **PDF** (pages↔images, merge, compress,
protect/unlock), **Audio** (convert MP3/M4A/WAV, trim, volume, speed), **Video** (trim, merge,
add audio, rotate, mirror, speed), **Download** (link→MP4/MP3 via yt-dlp).

## Layout

```
app/
  src/                  # React + TS UI
    components/         #   ImageTool, PdfTool, MediaTool, VideoTool, DownloadTool
                        #     + pdf/ media/ video/ submodes, EditPanel, TimeRange, shared ui.tsx
    lib/                #   invoke() wrappers + shared hooks (convert, pdf, media, audioEdit,
                        #     videoEdit, format, path, time, update, useFileDrop, useBatchQueue,
                        #     useFileEdit, useSingleFile, useTrim, usePdfItems)
  src-tauri/            # Rust = engine
    src/
      lib.rs            #   Tauri builder + command registry
      image_convert.rs  #   image engine: convert_image + resize/naming helpers + tests
      pdf*.rs / qpdf.rs / thumbnail.rs   #   pdfium render · printpdf build/compress · qpdf merge/encrypt
      ffmpeg.rs         #   shared sidecar plumbing (run_ffmpeg, with_suffix, atempo_chain)
      media.rs / download.rs / audio_edit.rs / video_edit.rs   #   ffmpeg + yt-dlp (cargo-tested)
  scripts/fetch-binaries.mjs
```

## Develop

Standalone single-project pnpm root:

```bash
pnpm install
node scripts/fetch-binaries.mjs   # auto-fetches yt-dlp, ffmpeg, pdfium (+ qpdf on Windows)
pnpm tauri dev                    # run the desktop app
```

Native binaries needed at runtime: `ffmpeg` + `yt-dlp` + `qpdf` (sidecars, `src-tauri/binaries/`)
and `pdfium` (dynamic library beside the executable). `fetch-binaries.mjs` places all of them on
Windows; on macOS/Linux it auto-fetches everything except `qpdf` (install that via your package
manager — `brew install qpdf` / `apt install qpdf`). Image conversion needs none (compiled-in
crates). Without the binaries the app still launches; the dependent tools error until present.

## Other commands

```bash
pnpm build        # tsc --noEmit + vite build → dist/
pnpm tauri build  # installer for the current OS (needs icons + binaries)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

Icons in `src-tauri/icons/` are generated (`pnpm tauri icon <png>`) — currently a placeholder
logo; replace before release.
