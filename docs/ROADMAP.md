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
| Phase 1 | Image: convert · compress · resize | ⬜ Planned |
| Phase 2 | PDF ⇄ image | ⬜ Planned |
| Phase 3 | Media convert (own files) | ⬜ Planned |
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
- ⬜ Convert: PNG ⇄ JPG ⇄ WebP (Canvas), + AVIF / JPEG-XL (jSquash).
- ⬜ Compress with quality slider + live before/after size preview.
- ⬜ Resize (by px or %), keep aspect ratio option.
- ⬜ Batch: drop many files, convert all, download as ZIP.
- ⬜ Broaden format coverage with `wasm-vips` (TIFF, GIF, BMP, HEIC-in) when needed.

**Exit criteria:** drag image(s) → pick target/quality/size → download, fully client-side,
off-main-thread, with the format matrix in the spec covered by tests.

### Phase 2 — PDF ⇄ image · spec: `specs/pdf-tools.md` (to be written)
- ⬜ PDF → images (per page, choose DPI/format) via `pdfjs-dist`.
- ⬜ Image(s) → PDF (order, page size, margins) via `pdf-lib`.
- ⬜ Merge images into a single multi-page PDF.
- 💡 PDF page operations (reorder/rotate/delete) — evaluate after the above.

### Phase 3 — Media convert (own files) · spec: `specs/media-convert.md` (to be written)
- ⬜ MP4 → MP3 (audio extract) and common A/V format conversions via `ffmpeg.wasm`.
- ⬜ Lazy-load the ffmpeg WASM (~30 MB) only when the tool opens.
- ⬜ Progress + cancel; clear "this stays on your device" messaging.
- ⚠️ Constraint: ffmpeg.wasm is slow/heavy. On desktop, route the same UI to the **native**
  ffmpeg sidecar for speed.

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
