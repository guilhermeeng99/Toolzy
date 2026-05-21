# Toolzy — Roadmap

> **Last updated**: 2026-05-21
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
| C | PDF native (pdfium / printpdf) | ✅ Done |
| D | Media + downloader (ffmpeg / yt-dlp) | ✅ Done |
| E | Cutover + full docs refresh | ✅ Done |
| F | Landing site | ✅ Done |

---

## Detail

- ✅ **A — Image PoC**: `app/` scaffolded (Vite + React + TS + Tailwind v4 + Tauri 2); native
  `convert_image` (`image` crate); resize/naming helpers with `cargo test`.
- 🚧 **B — Image full**: ✅ webp (libwebp) + gif/bmp/tiff; ✅ batch + native OS drag-drop;
  ✅ before/after size + delta. ⬜ AVIF (`ravif`/rav1e) + JPEG-XL (`jpegxl-rs`/libjxl) —
  heavy native encoders, deferred.
- ✅ **C — PDF native**: `pdf_to_images` (pdfium-render) + `images_to_pdf` (printpdf);
  two-mode PDF UI; shared `ui.tsx`. Runtime needs the pdfium library beside the exe.
- ✅ **D — Media + downloader**: `convert_media` (ffmpeg sidecar: mp3/m4a/wav, batch) and
  `download_media` (yt-dlp sidecar, `--ffmpeg-location`, prints final path; arg builder
  cargo-tested). tauri-plugin-shell + `externalBin` + shell capability;
  `scripts/fetch-binaries.mjs`.
- ✅ **E — Cutover + docs**: removed `apps/web`, old `apps/desktop`, `packages/*`, Turborepo,
  pnpm workspace, root vitest. Rewrote README, CLAUDE.md, all `docs/specs/*` (ADRs
  desktop-first) and this roadmap. CI = Biome + app/site builds.
- ✅ **F — Landing site**: static `site/` (Vite + Tailwind) presenting the app + a download
  CTA to GitHub Releases.

---

## Next / open

- ⬜ AVIF + JPEG-XL image output (heavy native encoders).
- ⬜ First real installers: generate final icons, fetch sidecars + pdfium, `pnpm tauri build`
  per OS, publish to GitHub Releases; point the site download link at the assets.
- ⬜ Site deploy workflow (GitHub/Cloudflare Pages).
- ⬜ Live progress for media convert + download (stream sidecar output).
- ⬜ Rust CI job (needs Tauri Linux deps + sidecars present).

## Backlog / ideas

- 💡 Image: crop/rotate, background removal, watermark, EXIF strip.
- 💡 PDF: compress, split/merge, reorder, password add/remove.
- 💡 Video transcode (mp4 → webm/gif, trim, resize) via native ffmpeg.
- 💡 In-app save-folder picker; reorder/drag in batch lists.
- 💡 Auto-update (Tauri updater) + signed builds.

## Out of scope (deliberate)

- Any hosted/server-side processing or a web app (desktop-native; only the static landing
  page is web). Accounts, cloud storage, sync. Paid tiers / feature gating.
