# Toolzy — Roadmap

> **Last updated**: 2026-05-22
> Single source of truth for what is **done**, **in progress**, and **planned**.
> Update in the same change that shifts scope (see `CLAUDE.md` → Post-Change Checklist).

Toolzy is a **desktop-native** app (Tauri 2 · React/TS/Vite · Tailwind · Rust engine). It
began as a client-side web app (Next.js) + a Tauri shell; in **2026-05** it pivoted to
desktop-only native — the web build and monorepo were removed (see
[ADR-007](specs/architecture.md#adr-007-pivot-from-web-to-desktop-native)).

## Legend

✅ Done · 🚧 In progress · ⬜ Planned · 💡 Backlog

---

## Status at a glance

| Phase | Theme | Status |
|---|---|---|
| A | Image PoC (native scaffold) | ✅ Done |
| B | Image full (formats, batch, drag-drop) | 🚧 webp + gif/bmp/tiff done; AVIF/JXL planned |
| C | PDF tools (pdfium / printpdf / qpdf) | ✅ Done |
| D | Media + downloader (ffmpeg / yt-dlp) | ✅ Done |
| E | Cutover + full docs refresh | ✅ Done |
| F | Landing site | ✅ Done |
| G | Release pipeline + auto-update (CI installer, signed updater, Pages) | ✅ Done |

---

## Detail

- ✅ **A — Image PoC**: `app/` scaffolded (Vite + React + TS + Tailwind v4 + Tauri 2); native
  `convert_image` (`image` crate); resize/naming helpers with `cargo test`.
- 🚧 **B — Image full**: ✅ webp (libwebp) + gif/bmp/tiff; ✅ batch + native OS drag-drop;
  ✅ before/after size + delta. ⬜ AVIF (`ravif`/rav1e) + JPEG-XL (`jpegxl-rs`/libjxl) —
  heavy native encoders, deferred.
- ✅ **C — PDF tools**: `pdf_to_images` (pdfium-render) + `images_to_pdf` (printpdf), plus
  **merge** (`merge_pdfs`), **compress** (`compress_pdf` — rasterize at a level, lossy),
  **protect/unlock** (`add_pdf_password` / `remove_pdf_password`) via the **qpdf** sidecar
  (Apache-2.0; arg builders cargo-tested). Six-mode PDF UI with drag-to-reorder lists; shared
  `ui.tsx`. Needs pdfium beside the exe + the qpdf sidecar. See [ADR-009](specs/architecture.md#adr-009-qpdf-sidecar-for-pdf-merge--encryption).
- ✅ **D — Media + downloader**: `convert_media` (ffmpeg sidecar: mp3/m4a/wav, batch) and
  `download_media` (yt-dlp sidecar, `--ffmpeg-location`, prints final path; arg builder
  cargo-tested). tauri-plugin-shell + `externalBin` + shell capability;
  `scripts/fetch-binaries.mjs`. **Quality picker**: `probe_media` lists available MP4
  resolutions (with merged size) + MP3 bitrate tiers before download (`--dump-single-json`,
  parser cargo-tested).
- ✅ **E — Cutover + docs**: removed `apps/web`, old `apps/desktop`, `packages/*`, Turborepo,
  pnpm workspace, root vitest. Rewrote README, CLAUDE.md, all `docs/specs/*` (ADRs
  desktop-first) and this roadmap. CI = Biome + app/site builds.
- ✅ **F — Landing site**: static `site/` (Vite + Tailwind) presenting the app + a download
  CTA to GitHub Releases.
- ✅ **G — Release & distribution**: GitHub Actions pipeline — CI (Biome + app/site build +
  `cargo test`) gates a patch bump → tag → **signed Windows installer** via `tauri-action`,
  published to GitHub Releases. In-app **auto-update** (`tauri-plugin-updater`, minisign-verified
  `latest.json`) with a current-version badge. Landing site auto-deploys to **GitHub Pages**
  (`deploy-site.yml`).

---

## Next / open

- ⬜ AVIF + JPEG-XL image output (heavy native encoders).
- ⬜ macOS / Linux installers in CI (the release job builds the **Windows** installer only today).
- ⬜ Final app icons (the current set is a placeholder; `pnpm tauri icon <png>`).
- ⬜ Live progress for media convert (stream sidecar output). _(Download progress: ✅ done —
  yt-dlp `--progress-template` streamed to the UI via a Tauri `Channel`.)_

## Backlog / ideas

- 💡 Image: crop/rotate, background removal, watermark, EXIF strip.
- ✅ PDF: compress, merge, reorder, password add/remove _(shipped — Phase C)_. ⬜ Remaining:
  **split** (extract page ranges), page-level reorder, lossless "keep text" compress.
- 💡 Video transcode (mp4 → webm/gif, trim, resize) via native ffmpeg.
- 💡 In-app save-folder picker; reorder/drag in batch lists.

## Out of scope (deliberate)

- Any hosted/server-side processing or a web app (desktop-native; only the static landing
  page is web). Accounts, cloud storage, sync. Paid tiers / feature gating.
