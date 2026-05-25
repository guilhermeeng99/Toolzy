# Architecture & Decision Records

> **Status**: Living document
> **Last updated**: 2026-05-22
> Cross-cutting design + the rationale (ADRs) behind the big choices. Feature-level contracts
> live in sibling files (`image-conversion.md`, etc.); start new ones from `_template.md`.

## 1. System shape

Toolzy is a **native desktop application** (Tauri 2). One app; the only web artifact is a
static landing/download page.

```
            ┌─────────────────────────────┐
            │      app/src (React + TS)    │  ← thin webview UI (Vite)
            │  components → lib/* wrappers  │
            └──────────────┬──────────────┘
                           │ invoke() (IPC)
            ┌──────────────▼──────────────┐
            │   app/src-tauri (Rust)      │  ← the engine: #[tauri::command]s
            └───┬───────────────────┬─────┘
   compiled-in  │                   │  spawned / loaded
   ┌────────────▼─────┐   ┌─────────▼───────────────┐
   │ crates:           │   │ native binaries:         │
   │ image, webp,      │   │ ffmpeg, yt-dlp, qpdf     │
   │ printpdf          │   │ (sidecars) · pdfium dll  │
   └───────────────────┘   └──────────────────────────┘
```

- **App**: Tauri bundles the OS webview + a Rust core. The UI calls Rust commands; Rust does
  the conversion natively and reads/writes files by path.
- **Site**: a separate static page (`site/`, Vite + Tailwind) presenting the app + download
  links. No backend anywhere.

The seam is the set of Rust **commands**. The UI renders controls and calls a typed wrapper;
it owns no conversion logic.

---

## ADRs

### ADR-001: Native, on-device
**Status:** Accepted · 2026-05-21 (supersedes the earlier "client-side-first / browser" stance)

**Context.** Toolzy is a personal-use file toolbox. Speed, reliability, and having *every*
tool (including the downloader) in one place matter more than zero-install web reach.

**Decision.** Do all work **natively on the user's machine** via Rust + bundled binaries. No
browser sandbox, no upload, no server.

**Consequences.**
- ✅ Native speed (e.g. real `ffmpeg` ≫ `ffmpeg.wasm`); no browser-memory ceiling; full
  filesystem access; no multi-MB WASM payloads.
- ✅ Strong privacy by construction — nothing leaves the device.
- ⚠️ Per-OS builds + a Rust toolchain; some tools need bundled native binaries.

### ADR-002: Tauri 2 (Rust engine + React/Vite UI)
**Status:** Accepted · 2026-05-21

**Decision.** Single desktop app: **Tauri 2** (Rust) for the core + native binaries; **React
+ TypeScript + Vite + Tailwind v4** for the UI in the OS webview.

**Consequences.**
- ✅ Small installers (OS webview, not Electron). Rust does heavy lifting; the UI stays thin.
- ✅ Vite is the natural Tauri front-end (fast HMR, simple static build).
- ⚠️ UI logic is constrained to `invoke()` calls; conversion lives in Rust.

### ADR-003: The downloader runs on the user's machine
**Status:** Accepted · 2026-05-21

**Context.** Downloading from sites like YouTube needs `yt-dlp`, and hosting it server-side is
unviable (datacenter-IP blocking, ToS/legal risk).

**Decision.** Run `yt-dlp` (+ `ffmpeg`) as **sidecars on the user's own machine and
residential IP**. Toolzy hosts nothing for it.

**Consequences.**
- ✅ No server, no proxy cost, no IP-block problem; legal exposure stays with the end user.
- ⚠️ `yt-dlp` breaks often → ship it as an updatable sidecar (`scripts/fetch-binaries.mjs`).

### ADR-004: Distribution
**Status:** Accepted · 2026-05-21

**Decision.** Ship installers via **GitHub Releases** (Windows/macOS/Linux). The static
landing page (`site/`) links to them and can be hosted on any static host (GitHub/Cloudflare
Pages).

**Status note (2026-05-22).** Live: a GitHub Actions pipeline auto-builds and publishes the
**Windows** installer on each push to `main` (macOS/Linux still manual), and the site
auto-deploys to **GitHub Pages** (`deploy-site.yml`). In-app updates: ADR-008.

### ADR-005: Library & license choices
**Status:** Accepted · 2026-05-21

**Decision.** App code is **MIT**. Choose permissive libraries; **never bundle AGPL**. Native
binaries run as separate processes (sidecars) or runtime-loaded dynamic libraries, not linked.

| Need | Library | License | Note |
|---|---|---|---|
| Image (common) | `image` crate | MIT/Apache | png/jpg/gif/bmp/tiff (+webp/avif decode) |
| WebP encode | `webp` (libwebp) | BSD | lossy webp |
| AVIF / JPEG-XL (planned) | `ravif` / `jpegxl-rs` | permissive | heavy native encoders |
| PDF read/render | `pdfium-render` (pdfium) | BSD-3 | runtime-loaded dynamic library |
| PDF write | `printpdf` | MIT | pure Rust |
| PDF merge / encrypt / decrypt | `qpdf` | Apache-2.0 | sidecar (separate process) |
| ~~PDF (MuPDF / Ghostscript)~~ | — | **AGPL** | ❌ excluded |
| Media | `ffmpeg` | LGPL/GPL build | sidecar (separate process) |
| Download | `yt-dlp` | Unlicense | sidecar |
| Transcription | `whisper.cpp` (`whisper-cli`) | MIT | sidecar; models (OpenAI Whisper) + Silero VAD also MIT, fetched on demand |

### ADR-006: Result-based error model (Rust ↔ UI)
**Status:** Accepted · 2026-05-21

**Decision.** Commands return `Result<T, String>`: `Ok` payload, or a short user-presentable
`Err` message (no panics across the IPC boundary). The UI shows the message; `invoke` rejects
on `Err`.

**Consequences.**
- ✅ Predictable failure surface; simple to display.
- ⚠️ Less structured than a typed error enum — acceptable for a single-app UI; revisit if the
  UI needs to branch on error kinds.

### ADR-007: Pivot from web to desktop-native
**Status:** Accepted · 2026-05-21

**Context.** Toolzy began as a client-side **web** app (Next.js static export) + a Tauri shell
for the desktop-only downloader. For personal use the web advantages (SEO, reach, free
hosting, zero-install) don't apply, while native gives speed + reliability + everything in one
tool.

**Decision.** Rebuild as a **desktop-only native app** (this `app/`). Remove the web build and
the monorepo scaffolding (`apps/web`, the old `apps/desktop` shell, `packages/*`, Turborepo,
the pnpm workspace). Keep a static landing page.

**Consequences.**
- ✅ Simpler repo (two standalone projects), native performance, one cohesive product.
- ⚠️ The conversion logic moved from TypeScript to Rust; the old `Converter`/registry/`Result`
  TS engine is gone.

### ADR-008: In-app auto-update (signed)
**Status:** Accepted · 2026-05-22

**Context.** A desktop app distributed outside an app store still needs a way to ship fixes
without the user re-downloading installers.

**Decision.** Bundle **`tauri-plugin-updater`**. On launch the app checks a `latest.json` on
GitHub Releases; release artifacts are **minisign-signed** in CI (`TAURI_SIGNING_PRIVATE_KEY`)
and verified against the public key in `tauri.conf.json` before installing. The UI shows the
current version and an "Update to vX" button (`lib/update.ts`, `App.tsx`); a failed check is
swallowed (offline → no prompt, never throws to the UI).

**Consequences.**
- ✅ One-click updates; the signature check rejects tampered artifacts.
- ⚠️ The signing key must stay secret; losing it breaks the update chain for installed apps.
- ⚠️ One outbound request to GitHub at startup (a version check — no file contents).

### ADR-009: qpdf sidecar for PDF merge & encryption
**Status:** Accepted · 2026-05-22

**Context.** The PDF tab grew four tools — merge, compress, add-password, remove-password
(`docs/specs/pdf-tools.md`). Merge and password handling need PDF *structure* and *crypto*
that our existing engines (pdfium = render, printpdf = write) don't provide. The one candidate
Rust crate, `lopdf`, only reads PDFs with *empty* passwords — it can't decrypt an arbitrary
password nor re-encrypt to AES-256. Ghostscript would do it all but is **AGPL** (excluded by
ADR-005).

**Decision.** Bundle **`qpdf`** (**Apache-2.0**) as a **sidecar**, used for merge
(`--empty --pages`), encrypt (`--encrypt … 256`), and decrypt (`--decrypt`). **Compress** does
*not* use it: it reuses pdfium + printpdf (rasterize each page, re-embed as JPEG/DCTDecode) so a
"how much" level slider has real, tunable effect — qpdf's lossless optimization can't tier.
Passwords ride on the process args (qpdf has no stdin password for encryption) and are never
logged; on the user's own machine this is standard qpdf usage.

**Consequences.**
- ✅ Robust, well-tested PDF crypto/merge without writing our own; license stays clean (MIT app).
- ✅ Arg builders are pure → `cargo test`; the sidecar follows the existing ffmpeg/yt-dlp pattern.
- ⚠️ qpdf ships as `qpdf.exe` **plus a few DLLs** on Windows; they must sit beside the sidecar
  (handled in `fetch-binaries.mjs` for dev and `tauri.conf.json` `resources` for the bundle —
  verify on a real `tauri build`). Auto-fetch is Windows-only today (matches the CI release
  scope); other OSes install qpdf via a package manager.
- ⚠️ Compress is **lossy** (text becomes pixels) — documented in the spec and the UI; a
  lossless "keep text" mode is deferred.

### ADR-010: Whisper transcription (sidecar + on-demand models, anti-hallucination)
**Status:** Accepted · 2026-05-25

**Context.** Users want speech→text **locally**, free, faithful for **pt-BR**, and **without
hallucination** (Whisper's failure mode: inventing / looping text over silence or noise). Speed is
explicitly secondary to a correct transcript.

**Decision.** Bundle **whisper.cpp** (`whisper-cli`, **MIT**) as a **sidecar**. Preprocess any
input to 16 kHz mono WAV with the existing **ffmpeg** sidecar, then recognize. Default model
**`large-v3`** (max fidelity). Models (OpenAI Whisper, MIT) + the small **Silero VAD** model
download **on demand** from Hugging Face to the app-data dir (too large to bundle). Recognition
always runs fixed **anti-hallucination** settings: Silero **VAD** (only detected speech reaches
Whisper), greedy decoding (`--temperature 0 --no-fallback`), and no previous-text conditioning
(`--max-context 0`). **CPU build** for v1 (portable). Whisper's `translate` task (→ English only)
is exposed; translation *into* other languages needs a separate MT engine and is out of scope.
See the [transcription spec](transcription.md).

**Why not Parakeet / Canary (NVIDIA).** Faster and leading in English, but trained on **European**
Portuguese (weaker pt-BR per NVIDIA's own model cards), and Parakeet is ASR-only. For faithful
pt-BR + integration simplicity, Whisper wins.

**Consequences.**
- ✅ Faithful, private, MIT-clean transcription; reuses the ffmpeg + sidecar/`Channel` patterns.
- ✅ Registry / URL / arg builders are pure → `cargo test`; flags verified against `whisper-cli`
  v1.8.4 (incl. JSON = `-oj`, VAD + decoding flags).
- ⚠️ A **third** outbound request type: the one-time model download from Hugging Face (model
  weights, never file contents), Rust-side (`ureq`) and user-initiated via the Download button.
- ✅ Optional **NVIDIA (CUDA) GPU engine**, downloaded on demand (~435 MB) to app-data and run via
  a plain process — measured **≈7–10×** on 1–2 min clips. CPU stays the bundled default/fallback;
  AMD/Intel (Vulkan) remains a possible future engine.
- ⚠️ `whisper-cli` ships as an exe + sibling DLLs on Windows (handled like qpdf in
  `fetch-binaries.mjs`, bundled via `resources` `binaries/*.dll`); auto-fetch is Windows-only.

---

## Cross-cutting concerns

### Native libs vs sidecars
Prefer a **compiled-in crate** (`image`, `webp`, `printpdf`) — no external binary to ship.
Use a **sidecar** when no good crate exists (`ffmpeg`, `yt-dlp`, `qpdf`, `whisper-cli`). **pdfium**
is special:
a prebuilt dynamic library loaded at runtime from beside the executable (fall back to a system
install).

### Threading
Each command runs off the UI thread (Tauri handles command execution). Batch operations loop
in the UI, invoking per file so each item reports its own status. pdfium/ffmpeg manage their
own internal threads.

### Files & dialogs
The UI gets real paths from native dialogs (`@tauri-apps/plugin-dialog`) and OS drag-drop
(`onDragDropEvent`). Rust reads/writes those paths directly — large bytes never cross the IPC.

### Privacy
No content-inspecting telemetry; no uploads; no Toolzy server in any path. Validate inputs
(e.g. http(s) URLs) before spawning a sidecar.

Four kinds of outbound request exist, all direct from the user's machine and unrelated to file
contents: (1) the updater's startup version check against GitHub Releases (ADR-008);
(2) the downloader's video **thumbnail** in the probe result, loaded from the source host
(e.g. `i.ytimg.com`) — the same host the download itself hits; (3) the **one-time Whisper
model download** from Hugging Face when the user clicks Download in the Audio tab's Transcribe mode (model
weights only — Rust-side via `ureq`, user-initiated; ADR-010); and (4) the **optional one-time
NVIDIA (CUDA) GPU engine download** (~435 MB) from GitHub Releases — also Rust-side via `ureq` and
user-initiated (ADR-010). The webview runs under a restrictive **CSP** (`tauri.conf.json` →
`app.security.csp`): `default-src 'self'` with remote images allowed (`img-src https: data:`) for
that thumbnail and no remote scripts.
