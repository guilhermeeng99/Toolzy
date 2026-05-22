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
   │ image, webp,      │   │ ffmpeg, yt-dlp (sidecars)│
   │ printpdf          │   │ pdfium (runtime dylib)   │
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
| ~~PDF (MuPDF)~~ | — | **AGPL** | ❌ excluded |
| Media | `ffmpeg` | LGPL/GPL build | sidecar (separate process) |
| Download | `yt-dlp` | Unlicense | sidecar |

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

---

## Cross-cutting concerns

### Native libs vs sidecars
Prefer a **compiled-in crate** (`image`, `webp`, `printpdf`) — no external binary to ship.
Use a **sidecar** when no good crate exists (`ffmpeg`, `yt-dlp`). **pdfium** is special: a
prebuilt dynamic library loaded at runtime from beside the executable (fall back to a system
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

Only two outbound requests exist, both direct from the user's machine and unrelated to file
contents: (1) the updater's startup version check against GitHub Releases (ADR-008), and
(2) the downloader's video **thumbnail** in the probe result, loaded from the source host
(e.g. `i.ytimg.com`) — the same host the download itself hits. The webview runs under a
restrictive **CSP** (`tauri.conf.json` → `app.security.csp`): `default-src 'self'` with remote
images allowed (`img-src https: data:`) for that thumbnail and no remote scripts.
