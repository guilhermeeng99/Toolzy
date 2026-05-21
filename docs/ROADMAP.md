# Toolzy — Roadmap

> **Last updated**: 2026-05-21
> Single source of truth for what is **done**, **in progress**, and **planned**.
> Update this file in the same PR that changes scope (see `CLAUDE.md` → Post-Change Checklist).

## Legend

- ✅ **Done** — shipped and verified.
- 🚧 **In progress** — actively being built.
- ⬜ **Planned** — agreed, not started.
- 💡 **Backlog / idea** — not yet committed.

## Status at a glance

| Phase | Theme | Status |
|---|---|---|
| Phase 0 | Foundation (docs, scaffold, CI/deploy) | 🚧 In progress |
| Phase 1 | Image: convert · compress · resize | 🚧 In progress |
| Phase 2 | PDF ⇄ image | ✅ Done |
| Phase 3 | Media convert (own files) | ✅ Done |
| Phase 4 | Desktop app + media downloader | ⬜ Planned |

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

### Phase 0 — Foundation (remaining)
- ⬜ `packages/engine`: `Converter` interface, registry, `Result`/`ToolzyError` types,
  Web Worker bridge (Comlink). _(Add Turborepo when this lands.)_
- ⬜ Test tooling: Vitest (unit) + Playwright (e2e) wired with a smoke test.
- ⬜ CI: GitHub Actions → build + lint + test; deploy static export to Cloudflare Pages on
  `main` (`_headers` COOP/COEP already in place).
- ⬜ Repo init: `git init`, MIT `LICENSE`, push to GitHub.

**Exit criteria:** site deployed on Cloudflare Pages, green CI, the engine registry callable
from a Worker with one trivial converter wired end-to-end.

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

### Phase 4 — Desktop app + downloader · spec: `specs/media-download.md` (to be written)
- ⬜ Tauri v2 shell wrapping `apps/web`; capability detection (`environment: 'desktop'`).
- ⬜ Bundle `yt-dlp` + `ffmpeg` as sidecars; auto-update `yt-dlp` binary.
- ⬜ Download UI: paste link → pick MP4 (quality) or MP3 → save to disk. Runs on the user's
  IP; nothing routed through us.
- ⬜ Cross-OS installers (Win/macOS/Linux) published to GitHub Releases via CI.
- ⬜ Web build shows a "Get the desktop app" placeholder on the downloader route.

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
