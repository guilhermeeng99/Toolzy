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
    components/        #   tools (ImageTool, PdfTool, MediaTool, DownloadTool) + shared ui.tsx
    lib/               #   invoke() wrappers + shared hooks/helpers (convert, pdf, media,
                       #     format, path, update, useFileDrop, useBatchQueue)
  src-tauri/          # Rust = the engine
    src/
      lib.rs           #   Tauri builder + command registry
      image_convert.rs #   image engine: convert_image command + resize/naming helpers + tests
      pdf.rs / pdf_build.rs   #   pdfium render / printpdf build
      media.rs / download.rs  #   ffmpeg + yt-dlp sidecar commands (download has unit tests)
    capabilities/      #   Tauri permissions (dialog, shell sidecar allow-list)
    tauri.conf.json    #   externalBin (yt-dlp, ffmpeg), bundle, window
    scripts/fetch-binaries.mjs  # fetch yt-dlp; print ffmpeg/pdfium instructions
site/                 # static landing/download page (Vite + Tailwind)
docs/specs/           # per-feature contracts + architecture.md (ADRs)
docs/ROADMAP.md       # done / doing / planned
```

Layer rules:

- **Rust (`src-tauri`)** owns conversion + the native libs/sidecars. Keep pure, testable
  logic (resize math, filename/arg building) in its own module with `#[cfg(test)]` tests.
- **React (`src`)** never converts. A component calls a `lib/*` wrapper → a Rust command.
- Native binaries (`ffmpeg`, `yt-dlp`) are **sidecars** (`externalBin` + a `shell:allow-execute`
  capability scoped to them). `pdfium` is a runtime-loaded dynamic library. Compiled-in crates
  (`image`, `webp`, `printpdf`) need no external binary.

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
| PDF | `pdfium-render` (read) + `printpdf` (write). **No MuPDF** (AGPL) |
| Media | native `ffmpeg` via Tauri sidecar |
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
node scripts/fetch-binaries.mjs   # fetch yt-dlp; print ffmpeg/pdfium placement
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests

# repo root
pnpm dlx @biomejs/biome ci .       # lint + format (CI parity)
```

> Run Biome via `pnpm dlx` (or `pnpm exec` inside a project) — there is no root `node_modules`.
> Note: on Windows, the RTK hook can mask `biome`/`pnpm` output; prefer the PowerShell tool to
> see real Biome results.

---

## Post-Change Checklist

After every change:

1. `cargo test` (if Rust touched) — green; new pure logic has tests, bug fixes get a regression test.
2. `pnpm build` in `app/` (and `site/` if touched) — tsc + Vite green.
3. `pnpm dlx @biomejs/biome ci .` — zero errors.
4. Touched a feature's behavior? Update its spec in `docs/specs/` in the same change.
5. Shipped/started/finished a roadmap item? Update `docs/ROADMAP.md`.

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
- Sidecars/pdfium are fetched by `scripts/fetch-binaries.mjs` (yt-dlp auto; ffmpeg + pdfium
  printed) and gitignored under `src-tauri/binaries`.
- Icons live in `src-tauri/icons` (`pnpm tauri icon <png>`). The current set is a placeholder.

---

## Privacy & Security

- No telemetry that inspects file contents. No uploads. No Toolzy server in any path.
- The downloader connects directly from the user's machine to the source.
- Validate inputs (e.g. http(s) URL) before spawning a sidecar; surface a clear `Err`.

---

## Out of Scope (for now)

- Any hosted/server-side processing or a public web app (the project is desktop-native; the
  only web artifact is the static landing page).
- User accounts, cloud storage, sync. Paid tiers / feature gating.
