# Toolzy — Roadmap

> **Last updated**: 2026-05-25
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
| H | Audio + video editing + compress (ffmpeg) | ✅ Done |
| I | Transcription (Whisper, local, anti-hallucination + NVIDIA GPU) | ✅ Done (verified on Windows incl. GPU) |
| J | Link transcription (yt-dlp -> Whisper -> timestamped Markdown) | ✅ Done |

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
- ✅ **D — Media + multi-site downloader**: `convert_media` (ffmpeg sidecar: mp3/m4a/wav,
  batch) plus a yt-dlp downloader for 1,000+ supported sites. Multiple URLs and playlists expand
  to a deduplicated, sequential queue; every item has MP4/MP3 quality selection, live progress,
  retry, actionable extractor errors, audio-only/generic fallbacks, and optional explicit browser
  cookies. MP4 prefers H.264/AAC and remuxes/recodes when needed. Pure URL/cookie/error/probe/arg/
  progress helpers are cargo-tested. Weekly CI checks upstream yt-dlp and ships a normal signed
  Toolzy update only when its tracked version changes. Spec: [media download](specs/media-download.md).
- ✅ **E — Cutover + docs**: removed `apps/web`, old `apps/desktop`, `packages/*`, Turborepo,
  pnpm workspace, root vitest. Rewrote README, CLAUDE.md, all `docs/specs/*` (ADRs
  desktop-first) and this roadmap. CI = Biome + app/site builds.
- ✅ **H — Audio + video editing**: native ffmpeg edits beyond convert. **Audio** (modes of the
  renamed **Audio** tab): `trim_audio` / `change_audio_volume` / `change_audio_speed`.
  **Video** (new **Video** tab): `trim_video` (lossless), `merge_videos` (concat-demuxer copy),
  `add_audio_to_video` (replace track), `rotate_video` (transpose), `mirror_video`
  (hflip/vflip), `change_video_speed` (setpts + atempo), `compress_video` (H.264/AAC in
  light/balanced/strong levels, 720p cap on strong). Shared `ffmpeg.rs` (`run_ffmpeg`,
  `with_suffix`, `atempo_chain`, `probe_duration`); filter/arg builders cargo-tested. Specs:
  [audio-edit](specs/audio-edit.md) + [video-edit](specs/video-edit.md).
- ✅ **F — Landing site**: static `site/` (Vite + Tailwind) presenting the app + a download
  CTA to GitHub Releases.
- ✅ **G — Release & distribution**: GitHub Actions pipeline — CI (Biome + app/site build +
  `cargo test`) gates a patch bump → tag → **signed Windows installer** via `tauri-action`,
  published to GitHub Releases. In-app **auto-update** (`tauri-plugin-updater`, minisign-verified
  `latest.json`) with a current-version badge. Landing site auto-deploys to **GitHub Pages**
  (`deploy-site.yml`).
- ✅ **I — Transcription**: local speech-to-text via the **whisper.cpp** (`whisper-cli`) sidecar —
  `transcribe_audio` (ffmpeg → 16 kHz WAV → whisper-cli), `list_whisper_models`,
  `download_whisper_model` (on-demand models from Hugging Face + Silero VAD; streamed progress).
  **Faithful by design** — Silero VAD + greedy/`--no-fallback` + `--max-context 0`
  (anti-hallucination); default `large-v3`. A **Transcribe** mode in the Audio tab with a one-time
  download gate, **Cancel**, remembered model/language (default pt), and elapsed-timer + `%`
  progress. **Optional NVIDIA GPU** engine (`download_gpu_engine`, on-demand CUDA — **≈7–10×** on
  1–2 min clips; CPU fallback). Pure helpers cargo-tested; verified on Windows incl. GPU. Spec:
  [transcription](specs/transcription.md); rationale [ADR-010](specs/architecture.md).
- ✅ **J — Link transcription**: paste a YouTube/media URL, download only the best audio with
  `yt-dlp`, run the existing Whisper pipeline locally, and save an organized Markdown transcript
  to Downloads. Uses two progress channels (download + transcription), the existing model gate,
  and the optional GPU engine. Speaker labels were removed after real interview testing showed
  local diarization was not reliable enough for the product bar. Spec:
  [link transcription](specs/link-transcription.md).

---

## Next / open

- ⬜ AVIF + JPEG-XL image output (heavy native encoders).
- ⬜ macOS / Linux installers in CI (the release job builds the **Windows** installer only today).
- ⬜ Final app icons (the current set is a placeholder; `pnpm tauri icon <png>`).
- ⬜ Live progress for media convert (stream sidecar output). _(Download progress: ✅ done —
  yt-dlp `--progress-template` streamed to the UI via a Tauri `Channel`.)_
- ⬜ Transcription on macOS/Linux: auto-fetch the `whisper-cli` + GPU engine (Windows-only today);
  AMD/Intel GPU via Vulkan. _(NVIDIA CUDA GPU + progress bar: ✅ done.)_

## Backlog / ideas

- 💡 Image: crop/rotate, background removal, watermark, EXIF strip.
- ✅ PDF: compress, merge, reorder, password add/remove _(shipped — Phase C)_. ⬜ Remaining:
  **split** (extract page ranges), page-level reorder, lossless "keep text" compress.
- ✅ Audio editing: trim, volume, speed _(shipped — Phase H)_.
- ✅ Video editing: trim, merge, add-audio, rotate, mirror, speed _(Phase H)_; **compress**
  (H.264/AAC mp4 in levels, strong caps to 720p — shrink for sharing). ⬜ Remaining: transcode to
  other formats (webm/gif), crop; re-encode merge for mixed-format clips; mix (not replace) added
  audio; per-frame/ffmpeg progress for compress.
- 💡 In-app save-folder picker; reorder/drag in batch lists.

## Out of scope (deliberate)

- Any hosted/server-side processing or a web app (desktop-native; only the static landing
  page is web). Accounts, cloud storage, sync. Paid tiers / feature gating.
