# Toolzy — Project Conventions

Free, open-source, privacy-first **native desktop** file toolbox (image / PDF / media
conversion + a media downloader). Built with Tauri 2: **Rust is the engine** (conversion runs
natively); the **React + TypeScript (Vite)** UI is a thin webview front-end. See
[`README.md`](README.md) for the overview and
[`docs/specs/architecture.md`](docs/specs/architecture.md) for the decision records.

---

## Core Principles

1. **Privacy is a feature, not a footnote.** Everything runs on the user's machine. No
   uploads, no account, no Toolzy server — ever.
2. **Native over sandboxed.** Heavy work runs in Rust / bundled native binaries, not in a
   browser. Prefer a compiled-in crate; fall back to a sidecar when a crate isn't viable.
3. **Rust is the engine; the UI orchestrates.** Conversion logic lives in `app/src-tauri`.
   React components hold no conversion logic — they call a typed `lib/*` wrapper that calls a
   Rust command via `invoke()`.
4. **One app, no monorepo.** `app/` (the desktop app) and `site/` (the landing page) are
   independent pnpm projects. No workspace, no Turborepo.

---

## Architecture

```
app/
  src/                # React + TS UI (Vite). Presentation only.
    components/        #   tools (ImageTool, PdfTool, MediaTool, VideoTool, DownloadTool,
                       #     MediaDownloadPanel)
                       #     + pdf/ media/ video/ submodes + shared components
                       #     (BatchPanel, DownloadBar, EditPanel, TimeRange, TranscribeTool, ui.tsx)
    lib/               #   typed invoke() wrappers (one per command group) + shared
                       #     hooks/helpers (format, path, time, update + use* hooks for file
                       #     pick/drop/edit, batch, trim, pdf items, whisper models, gpu engine)
  src-tauri/          # Rust = the engine
    src/
      lib.rs           #   Tauri builder + command registry
      image_convert.rs #   image engine: convert_image + resize/naming helpers + tests
      pdf*.rs          #   pdf (pdfium render) · pdf_build/pdf_compress (printpdf) ·
                       #     pdf_merge/pdf_protect (qpdf) + qpdf.rs runner + thumbnail.rs
      ffmpeg.rs        #   shared sidecar plumbing (run_ffmpeg, with_suffix, atempo_chain)
      media.rs / download.rs  #   ffmpeg convert + yt-dlp download sidecars (cargo-tested)
      audio_edit.rs / video_edit.rs  #   ffmpeg edits: trim/volume/speed/merge/rotate/compress/… (cargo-tested)
      transcription.rs #   local speech-to-text (whisper-cli sidecar + on-demand models/GPU; cargo-tested)
    capabilities/      #   Tauri permissions (dialog, shell sidecar allow-list)
    tauri.conf.json    #   externalBin (yt-dlp, ffmpeg, qpdf, whisper-cli), pdfium resource, bundle, window
  scripts/fetch-binaries.mjs  # auto-fetch yt-dlp/ffmpeg/pdfium (+ qpdf & whisper-cli on Windows)
site/                 # static landing/download page (Vite + Tailwind)
docs/specs/           # per-feature contracts + architecture.md (ADRs)
docs/ROADMAP.md       # done / doing / planned
```

Layer rules:

- **Rust (`src-tauri`)** owns conversion + the native libs/sidecars. Keep pure, testable
  logic (resize math, filename/arg building) in its own module with `#[cfg(test)]` tests.
- **React (`src`)** never converts. A component calls a `lib/*` wrapper → a Rust command.
- Native binaries (`ffmpeg`, `yt-dlp`, `qpdf`, `whisper-cli`) are **sidecars** (`externalBin` + a
  `shell:allow-execute` capability scoped to them; `yt-dlp` and `whisper-cli` also have
  `shell:allow-spawn` for streamed progress — spawn needs its own scope entry). `pdfium` is a
  runtime-loaded dynamic library. Compiled-in crates (`image`, `webp`, `printpdf`) need no
  external binary.

---

## The Engine (Rust commands)

A tool = a `#[tauri::command]` that does the work natively and returns `Result<T, String>`.

```rust
#[tauri::command]
fn convert_image(
    path: String,
    target: String,
    quality: Option<u8>,
    resize: Option<ResizeOpt>,
) -> Result<ConvertResult, String> { /* read file, convert natively, write, return path+sizes */ }
```

Rules:

- **Commands return `Result<T, String>`** — `Ok` with the saved path / payload, `Err` with a
  short, user-presentable message (e.g. `"decode failed: …"`). Map every internal error with
  `.map_err(|e| format!("…: {e}"))`. Never `panic!` in a command.
- **Read/write files by path** in Rust (the UI passes paths from native dialogs / drag-drop).
  Don't ship large file bytes across the IPC.
- **Sidecars**: invoke via `app.shell().sidecar("name")`; check `output.status.success()`; on
  failure return the stderr tail. Add the binary to `externalBin` + the shell capability.
- **Long/parallel** work: `async fn` commands; batch by looping in the UI so each item gets
  its own status.
- **Pure helpers** (no Tauri, no I/O) live in a module and are covered by `cargo test`.

### UI side

- Each command has a typed wrapper in `app/src/lib/*.ts` calling `invoke<T>("cmd", args)`.
  Tauri maps JS camelCase args to Rust snake_case params; structs use serde `rename_all =
  "camelCase"`.
- Components import wrappers, never `invoke` directly for logic. Shared visuals live in
  `components/ui.tsx` (Card, Field, Slider, pill, dropzone, …) — don't duplicate them.
- File input is native: `@tauri-apps/plugin-dialog` (`open`/`save`) and
  `getCurrentWebview().onDragDropEvent` (real paths). No browser `<input type=file>` upload path.

---

## Code Style

- Functions: **5–25 lines**. Split if longer. One responsibility per function/module (SRP).
- Files: ideally under **400–600 lines**.
- Prefer small, composable components / helpers.

### Naming

- Specific and intention-revealing. Avoid generic `data`, `manager`, `handler`, `utils`.
- Searchable and unique within the codebase.

### Control Flow

- Early returns over nesting. Max **2 levels** of indentation.

---

## Comments

- Write **WHY**, not WHAT. Preserve decisions; don't strip meaningful comments in refactors.
- Document exported APIs / commands: intent, params, and any runtime requirement (e.g. "needs
  the ffmpeg sidecar").

---

## Key Technologies

| Aspect | Detail |
|---|---|
| Shell | Tauri 2 (Rust) |
| UI | React + TypeScript (`strict`) + Vite |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Image | `image` crate (png/jpg/gif/bmp/tiff) + `webp` (libwebp); AVIF/JXL planned |
| PDF | `pdfium-render` (read) + `printpdf` (write) + `qpdf` sidecar (merge/encrypt/decrypt). **No MuPDF/Ghostscript** (AGPL) |
| Media | native `ffmpeg` via Tauri sidecar — convert + audio/video editing |
| Transcription | `whisper.cpp` (`whisper-cli` sidecar) — local speech-to-text, optional NVIDIA CUDA GPU |
| Download | `yt-dlp` via Tauri sidecar |
| Dialogs / drag-drop | `@tauri-apps/plugin-dialog` + webview drag-drop (native paths) |
| Package manager | pnpm — `app/` and `site/` are standalone single-project roots |
| Lint / format | Biome |
| Tests | `cargo test` (Rust) · Vitest/Playwright not used (UI is thin) |
| i18n | English only (not planned) |

---

## Commands

```bash
# app/ (the desktop app) — standalone pnpm project
pnpm install
pnpm tauri dev        # run the desktop app (Vite + Tauri)
pnpm build            # tsc --noEmit + vite build
pnpm tauri build      # installer for the current OS (needs icons + sidecar binaries)
node scripts/fetch-binaries.mjs   # auto-fetch yt-dlp/ffmpeg/pdfium (+ qpdf on Windows)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings   # release CI gate (warnings = errors)

# repo root
pnpm dlx @biomejs/biome@1.9.4 ci .   # lint + format (pin matches CI)
```

> Run Biome via `pnpm dlx` (or `pnpm exec` inside a project) — there is no root `node_modules`.
> Note: on Windows, the RTK hook can mask `biome`/`pnpm` output; prefer the PowerShell tool to
> see real Biome results.

---

## Post-Change Checklist

After every change:

1. `cargo test` (if Rust touched) — green; new pure logic has tests, bug fixes get a regression test.
2. `cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings` (if Rust touched) — zero warnings. **The release CI gates on this**; `cargo test` alone won't catch clippy lints (`too_many_arguments`, doc formatting, …), and a red clippy silently blocks the release.
3. `pnpm build` in `app/` (and `site/` if touched) — tsc + Vite green.
4. `pnpm dlx @biomejs/biome@1.9.4 ci .` — zero errors (pin matches CI).
5. Touched a feature's behavior? Update its spec in `docs/specs/` in the same change.
6. Shipped/started/finished a roadmap item? Update `docs/ROADMAP.md`.

---

## Spec-Driven Development

Every feature has a contract at `docs/specs/<feature>.md` before new code. Use
[`docs/specs/_template.md`](docs/specs/_template.md). Sections: Overview + scope, Formats,
Engine contract (the Rust command), Business rules (numbered, testable), Options, UI states,
Edge cases, Testing checklist, Out of scope. Keep spec and code in sync.

---

## Desktop / Tauri

- Native features ship as **sidecars** (separate processes), keeping the MIT license clean.
- A command that shells out maps a non-zero exit to an `Err(String)` (stderr tail). yt-dlp
  gets `--ffmpeg-location <exe dir>` so it finds the bundled ffmpeg off-PATH.
- Sidecars/pdfium are auto-fetched by `app/scripts/fetch-binaries.mjs` (yt-dlp/ffmpeg/pdfium on
  all platforms; qpdf on Windows — other OSes install it via a package manager) and gitignored
  under `src-tauri/binaries` + `src-tauri/pdfium`.
- Icons in `src-tauri/icons` are generated from `app/app-icon.png` (the canonical 512×512 brand
  logo) via `pnpm tauri icon` run from `app/`. Edit the source, regenerate — never hand-edit the set.

---

## Privacy & Security

- No telemetry that inspects file contents. No uploads. No Toolzy server in any path.
- The downloader connects directly from the user's machine to the source.
- Downloader URLs use strict HTTP(S) parsing; yt-dlp always gets `--ignore-config`. Browser cookies
  require an explicit allow-listed UI choice and are never persisted by Toolzy.

---

## Out of Scope (for now)

- Any hosted/server-side processing or a public web app (the project is desktop-native; the
  only web artifact is the static landing page).
- User accounts, cloud storage, sync. Paid tiers / feature gating.
