# Toolzy (desktop app)

The native desktop app: **Tauri 2 (Rust) · React + TypeScript + Vite · Tailwind v4 · pnpm**.
Rust is the engine (conversion runs natively); the React UI is a thin webview front-end.

Tools: **Image** (convert/resize, batch, drag-drop), **PDF** (pages↔images), **Media**
(MP4→MP3 via ffmpeg), **Download** (link→MP4/MP3 via yt-dlp).

## Layout

```
app/
  src/                  # React + TS UI
    components/         #   ImageTool, PdfTool, MediaTool, DownloadTool, shared ui.tsx
    lib/                #   typed invoke() wrappers (convert, pdf, media, format)
  src-tauri/            # Rust = engine
    src/
      lib.rs            #   commands: convert_image (+ encode)
      image_convert.rs  #   pure helpers + cargo tests
      pdf.rs / pdf_build.rs
      media.rs / download.rs   #   ffmpeg + yt-dlp sidecars (download cargo-tested)
  scripts/fetch-binaries.mjs
```

## Develop

Standalone project (not in a pnpm workspace) — install with `--ignore-workspace`:

```bash
pnpm install --ignore-workspace
node scripts/fetch-binaries.mjs   # yt-dlp (auto); prints where to put ffmpeg + pdfium
pnpm tauri dev                    # run the desktop app
```

Native binaries needed at runtime: `ffmpeg` + `yt-dlp` (sidecars, `src-tauri/binaries/`) and
`pdfium` (dynamic library beside the executable). Image conversion needs none (compiled-in
crates). Without them the app still launches; the dependent tools error until present.

## Other commands

```bash
pnpm build        # tsc --noEmit + vite build → dist/
pnpm tauri build  # installer for the current OS (needs icons + binaries)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

Icons in `src-tauri/icons/` are generated (`pnpm tauri icon <png>`) — currently a placeholder
logo; replace before release.
