# Toolzy

A free, open-source, **native desktop** toolbox for everyday file tasks: convert images,
work with PDFs (images ↔ PDF, merge, compress, password), convert your own audio/video, and
download audio/video from a link — all on your own machine.

**The promise:** your files never leave your device. Conversion runs **natively** (Rust +
bundled binaries), not in a browser sandbox — fast, reliable, no upload, no account, no server.

> ## 🌐 [**Website → guilhermeeng99.github.io/Toolzy**](https://guilhermeeng99.github.io/Toolzy/)
> ⬇️ **[Download the latest release](https://github.com/guilhermeeng99/Toolzy/releases/latest)** (Windows · self-updating)

## What it does

Status: ✅ done · 🚧 in progress · ⬜ planned. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

| Feature | Status | Engine |
|---|---|---|
| Image convert + resize (PNG/JPG/WebP/GIF/BMP/TIFF), batch, drag-drop | ✅ | Rust `image` + `webp` |
| PDF → images (per page) · images → PDF | ✅ | `pdfium-render` · `printpdf` |
| PDF merge · compress (lossy) | ✅ | `qpdf` · `pdfium`+`printpdf` |
| PDF protect · unlock (AES-256 password) | ✅ | `qpdf` sidecar |
| Audio convert (→ MP3, M4A, WAV) · trim · volume · speed | ✅ | `ffmpeg` sidecar |
| Transcribe speech → text (local Whisper, optional NVIDIA GPU) | ✅ | `whisper.cpp` sidecar |
| Video trim · merge · add-audio · rotate · mirror · speed · compress | ✅ | `ffmpeg` sidecar |
| Media downloader (link → MP4 / MP3) | ✅ | `yt-dlp` + `ffmpeg` sidecars |
| AVIF / JPEG-XL image output | ⬜ | `ravif` / `jpegxl-rs` |

## Download

Grab the latest **Windows** installer from [GitHub Releases](https://github.com/guilhermeeng99/Toolzy/releases)
(self-updating). macOS/Linux aren't built in CI yet — build them yourself (below).

## Privacy

- Everything runs **on your machine**. Files are never uploaded.
- No analytics that read file contents. No accounts. No tracking.
- The downloader talks directly from your machine to the source — never through a Toolzy
  server (there isn't one).

## Architecture

A single desktop app (Tauri 2): **Rust is the engine** (conversion runs natively); the
**React UI** is a thin webview front-end that calls Rust via `invoke()`. A tiny static site
presents the app and links to downloads.

```
toolzy/
├── app/                 # the desktop app
│   ├── src/             #   React + TypeScript UI (Vite) — calls invoke()
│   │   ├── components/  #     tools + shared ui.tsx
│   │   └── lib/         #     typed invoke() wrappers
│   └── src-tauri/       #   Rust = the engine
│       └── src/         #     commands: image / pdf / audio+video / transcription / download (+ pure helpers, cargo-tested)
├── site/                # static landing + download page (Vite + Tailwind)
└── docs/                # specs + architecture (ADRs) + roadmap
```

Layering:

- **`app/src-tauri` (Rust)** owns the conversion logic and the native libraries/sidecars.
  Pure helpers (resize math, filename/arg building) live in their own modules with
  `cargo test`.
- **`app/src` (React)** is presentation only. Components call a typed `lib/*` wrapper, which
  calls a Rust command — the UI holds no conversion logic.
- **Native binaries** (`ffmpeg`, `yt-dlp`, `qpdf`, `whisper-cli`) ship as Tauri **sidecars**;
  **pdfium** is a dynamic library loaded at runtime. Compiled-in crates (`image`, `webp`,
  `printpdf`) need no external binary.

## Tech stack

| Concern | Tool |
|---|---|
| Shell | Tauri 2 (Rust) |
| UI | React + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Image | `image` crate (+ `webp`/libwebp); AVIF/JXL planned |
| PDF | `pdfium-render` (read) · `printpdf` (write) · `qpdf` (merge/encrypt/decrypt, sidecar) — **no MuPDF/Ghostscript** (AGPL) |
| Media | native `ffmpeg` (sidecar) — convert + audio/video editing |
| Transcription | `whisper.cpp` (`whisper-cli` sidecar) — local, optional NVIDIA CUDA GPU |
| Download | `yt-dlp` (sidecar) |
| Package manager | pnpm (each of `app/`, `site/` is standalone) |
| Lint / format | Biome |
| CI | GitHub Actions (Biome + `cargo test` + app/site builds; gated release → signed Windows installer + Pages) |

See [`docs/specs/architecture.md`](docs/specs/architecture.md) for the rationale (ADRs).

## Running locally

> Prerequisites: Node.js ≥ 22, pnpm ≥ 11, the Rust toolchain, and your OS's
> [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (e.g. WebView2 on Windows).

```bash
cd app
pnpm install
node scripts/fetch-binaries.mjs   # auto-fetches yt-dlp, ffmpeg, pdfium (+ qpdf & whisper-cli on Windows; mac/Linux install qpdf via a package manager, build whisper.cpp from source)
pnpm tauri dev                    # run the desktop app
```

Without the native binaries the app still runs; the media/download/PDF tools need them at
runtime (`scripts/fetch-binaries.mjs` explains where each goes).

### Build an installer

```bash
cd app
pnpm tauri build                  # installer for the current OS (needs icons + binaries)
```

### Landing site

```bash
cd site
pnpm install
pnpm dev      # preview · pnpm build → static dist/
```

## Checks

```bash
# from app/
pnpm build                                         # tsc --noEmit + vite build
cargo test --manifest-path src-tauri/Cargo.toml    # Rust unit tests
# from repo root
pnpm dlx @biomejs/biome@1.9.4 ci .                  # lint + format (pin matches CI)
```

## License

App code: **MIT** (see `LICENSE`). Bundled binaries keep their own licenses and run as
**separate processes** (sidecars) or dynamically-loaded libraries, so they don't change the
app's license: `ffmpeg` (LGPL/GPL build), `yt-dlp` (Unlicense), `pdfium` (BSD-3), `qpdf`
(Apache-2.0), `whisper.cpp` (MIT). Do not bundle AGPL libraries — see [ADR-005](docs/specs/architecture.md#adr-005-library--license-choices).

## Legal note

Toolzy is a general-purpose tool that runs entirely on the user's machine. Downloading
content you do not have the right to download may violate a site's Terms of Service or local
law. Respecting those terms is the user's responsibility.
