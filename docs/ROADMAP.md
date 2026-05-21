# Toolzy — Roadmap

> **Last updated**: 2026-05-21
> Single source of truth for what is **done**, **in progress**, and **planned**.
> Update this file in the same PR that changes scope (see `CLAUDE.md` → Post-Change Checklist).

## 🔱 Direction change (2026-05-21): desktop-native pivot

Toolzy is becoming a **desktop-only, native** app for personal use. The web-first reasons
(SEO, reach, free hosting, zero-install for strangers) no longer apply; native gives speed +
reliability and lets **everything — including the downloader — live in one tool**.

**New stack:** Tauri 2 (Rust) · React + TypeScript + Vite · Tailwind v4 · pnpm. **Single app**
(no monorepo): Rust is the engine, the React UI is a thin webview front-end. A tiny static
**landing/download page** ships *after* the app.

Everything under "Status at a glance" and below describes the **superseded** web build
(`apps/web` + `packages/*`); it stays until the native app reaches parity (Phase E), then is
removed and ADR-001/003 are rewritten.

### Native phases
- ✅ **A — Image PoC** (branch `refactor/desktop-native-vite`): `app/` scaffolded
  (Vite+React+TS+Tailwind+Tauri 2); native `convert_image` (Rust `image` crate: png/jpg +
  resize/quality); resize/naming logic ported with `cargo test` (7 green). Verified: tsc,
  vite build, cargo test.
- ⬜ **B — Image full**: webp (libwebp), AVIF (`ravif`), JPEG-XL (`jpegxl-rs`); batch +
  native drag-drop; before/after size + delta.
- ⬜ **C — PDF native**: PDF→image via `pdfium-render`; image(s)→PDF via `printpdf`.
- ⬜ **D — Media + downloader native**: ffmpeg sidecar (MP4→MP3, video); yt-dlp sidecar
  downloader (port `download_media`, keep `--ffmpeg-location`).
- ⬜ **E — Cutover**: delete `apps/web`, `packages/*`, Turborepo, workspace; rewrite
  ADR-001/003 (desktop-first); single-app CI (Rust `cargo test` + front-end build).
- ✅ **F — Landing site**: static page (`site/`, Vite + Tailwind) presenting the app + a
  download CTA to GitHub Releases. Built early at the owner's request; point the download
  link at real installer assets once published, and wire a Pages deploy.

---

## Legend

- ✅ **Done** — shipped and verified.
- 🚧 **In progress** — actively being built.
- ⬜ **Planned** — agreed, not started.
- 💡 **Backlog / idea** — not yet committed.

## Status at a glance

| Phase | Theme | Status |
|---|---|---|
| Phase 0 | Foundation (docs, scaffold, engine, CI) | ✅ Done |
| Phase 1 | Image: convert · compress · resize | 🚧 In progress (Canvas shipped; AVIF/JXL pending) |
| Phase 2 | PDF ⇄ image | ✅ Done |
| Phase 3 | Media convert (own files) | ✅ Done |
| Phase 4 | Desktop app + media downloader | 🚧 In progress |

---

## ✅ Done

### Decisions & docs
- ✅ Architecture decided: client-side-first, no backend, one codebase → two builds
  (web + Tauri desktop). See [`specs/architecture.md`](specs/architecture.md).
- ✅ Hosting decided: Cloudflare Pages for web (unlimited bandwidth, commercial-OK).
- ✅ Downloader strategy decided: **desktop-only**, runs on the user's residential IP — no
  hosted server, no proxy cost, no ToS liability for us.
- ✅ License/library policy decided: app code MIT; avoid AGPL (no MuPDF); native binaries as
  sidecars (separate processes).
- ✅ Documentation structured: `README.md`, `CLAUDE.md`, `docs/specs/`, this roadmap,
  spec template, and the first feature spec (`image-conversion.md`).
- ✅ Design system decided + documented (`specs/design-system.md`): Calendly "Sky Blueprint"
  tokens, light theme, Montserrat as the free substitute for proprietary Gilroy.

### Foundation (Phase 0 build)
- ✅ Monorepo: pnpm workspaces (`apps/web`, `packages/config`). Turborepo deferred until a
  second buildable package (`engine`) exists — not worth the ceremony for one app yet.
- ✅ `apps/web`: Next.js 15 (App Router, `output: export`) + TypeScript strict + Tailwind v4.
- ✅ Design tokens wired into Tailwind v4 `@theme` (`app/globals.css`); Montserrat via
  `next/font`. Base UI: `Button` (4 variants), `Card`, `Badge` + landing shell
  (header, hero, tools grid, privacy strip, footer).
- ✅ Tooling: Biome (lint/format), strict shared tsconfig, `_headers` (COOP/COEP).
- ✅ Build verified: `pnpm build` → static export green (type-check passes, ~102 kB First Load JS).

---

## 🚧 In progress

### Phase 0 — Foundation
- ✅ `packages/engine`: `Converter` interface, registry (`registerBuiltins`), `Result`/
  `ToolzyError` types, Web Worker bridge (Comlink). Turborepo wired.
- ✅ Test tooling: Vitest (unit) wired; engine + app helpers covered. _(Playwright e2e: planned.)_
- ✅ CI: GitHub Actions → lint + typecheck + test + build on push/PR. _(Cloudflare deploy job:
  dashboard-connected; Actions deploy optional — see README.)_
- ✅ Repo init: `git init`, MIT `LICENSE`, pushed to GitHub.

**Exit criteria (met):** green CI; the image converter wired end-to-end (registry →
Worker → Canvas → download). Cloudflare deploy is dashboard-driven.

---

## ⬜ Planned

### Phase 1 — Image (MVP) · spec: [`image-conversion.md`](specs/image-conversion.md)
- ✅ Convert PNG / JPG / WebP (Canvas API, in a Web Worker via Comlink).
- ✅ Compress with quality slider + live before/after size and delta.
- ✅ Resize (px or %), keep-aspect option; EXIF orientation applied; transparent to JPG flattens to white.
- ✅ Batch: drop many files, convert all, per-file or ZIP download (fflate).
- ✅ Tool page at `/tools/image`, linked from the landing grid.
- ⬜ AVIF / JPEG-XL via jSquash (needs WASM bundling in Next).
- ⬜ Broaden formats with `wasm-vips` (TIFF, GIF, BMP, HEIC-in) when needed.
- ⬜ Playwright e2e smoke for the tool.

**Exit criteria:** drag image(s) → pick target/quality/size → download, fully client-side,
off-main-thread, with the format matrix in the spec covered by tests.

### Phase 2 — PDF ⇄ image · spec: [`pdf-tools.md`](specs/pdf-tools.md)
- ✅ PDF to images (per page, choose PNG/JPG and scale) via `pdfjs-dist`.
- ✅ Images to PDF (reorder, page size fit/A4/Letter) via `pdf-lib`.
- ✅ Multi-page PDF from many images; page grid with per-page and ZIP download.
- ✅ Tool page at `/tools/pdf` (tabbed), linked from the landing grid.
- 💡 PDF page operations (rotate/delete/compress/split): evaluate later.

### Phase 3 — Media convert (own files) · spec: [`media-convert.md`](specs/media-convert.md)
- ✅ Extract/convert audio to MP3 / M4A / WAV via `ffmpeg.wasm` (single-thread core).
- ✅ Lazy-load the ~30 MB core only on first use; served same-origin from `/ffmpeg/*`.
- ✅ Real ffmpeg progress bar; "stays on your device" messaging.
- ✅ Tool page at `/tools/media`, linked from the landing grid.
- ⬜ Video transcoding (mp4 to webm/gif, trim, resize): heavy in WASM, faster on desktop.
- ⬜ Cancel mid-run and batch (single-thread core limits this; revisit later).
- Note: on the desktop build, route this UI to the native ffmpeg sidecar for speed.

### Phase 4 — Desktop app + downloader · spec: [`media-download.md`](specs/media-download.md)
- ✅ Web build shows a "get the desktop app" placeholder at `/tools/download`.
- ✅ Capability detection (`lib/desktop.ts`) + lazy `@tauri-apps/api` invoke wrapper.
- ✅ Tauri v2 scaffold (`apps/desktop`, outside the pnpm workspace so CI/web ignore it):
  config, Rust `download_media` command (yt-dlp sidecar), capabilities, `fetch-binaries`
  script, build docs.
- ✅ `download_media` points yt-dlp at the bundled ffmpeg via `--ffmpeg-location` and returns
  the final file path (`--print after_move:filepath`).
- ⬜ First local build: generate icons, fetch sidecars, run `pnpm desktop:build` (needs the
  Rust toolchain). Not run in this environment.
- ⬜ Stream live yt-dlp progress to the UI (V1 shows a busy state).
- ⬜ Cross-OS installers via a CI matrix, published to GitHub Releases.

---

## 💡 Backlog / ideas

- 💡 Image tools: crop, rotate, background removal (WASM model), watermark, color/EXIF strip.
- 💡 PDF: compress, split, password add/remove (client-side).
- 💡 Other converters: SVG → PNG, ICO generator/favicon set, GIF ⇄ MP4.
- 💡 PWA install + offline (cache WASM) for the web build.
- 💡 i18n beyond en/pt-BR.
- 💡 Donation link (no feature gating).
- 💡 Per-tool deep links + shareable presets (no file data, just settings).

---

## Out of scope (deliberate)

- Hosted/server-side processing or a public download API — see
  [ADR-001](specs/architecture.md#adr-001-client-side-first) /
  [ADR-003](specs/architecture.md#adr-003-the-downloader-is-desktop-only).
- Accounts, cloud storage, paid tiers.
