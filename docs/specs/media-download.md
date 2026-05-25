# Media Downloader Feature Spec

> **Status**: Shipped (native). yt-dlp + ffmpeg sidecars.
> **Last updated**: 2026-05-22
> **Environment**: desktop (native)

Download audio/video from a link as MP4 or MP3 using `yt-dlp` + `ffmpeg` that run on the
**user's own machine and residential IP**. See
[ADR-003](architecture.md#adr-003-the-downloader-runs-on-the-users-machine): no hosted server,
so no datacenter-IP blocking and no ToS/legal exposure for the project.

**Scope decisions:**

- **Probe, then pick.** Paste a link → **Search** lists the *available* qualities (with sizes)
  → the user downloads the one they want. No upfront "best quality" guess.
- **Sidecars, not linking.** `yt-dlp` + `ffmpeg` are Tauri sidecars (separate processes).
- **`yt-dlp` auto-updates** via `scripts/fetch-binaries.mjs` (decoupled from app releases).
- **Saves to the OS Downloads folder** in V1 (no in-app folder picker).

---

## 1. Behavior

1. **Search** runs `probe_media` → `yt-dlp --dump-single-json` (metadata only, no download).
   The UI shows the title + thumbnail to confirm the link, then two tabs:
   - **Video (MP4)** — one row per available resolution (e.g. 2160p…144p), with the *merged*
     (video + best audio) size from yt-dlp's `filesize`/`filesize_approx`.
   - **Audio (MP3)** — fixed bitrate tiers (320/256/192/128/96/64 kbps). YouTube serves no
     mp3, so these are ffmpeg transcode targets; the size is **estimated** from the duration
     (bytes ≈ `duration_s × kbps × 1000 / 8`), shown as a guide.
2. **Download** on a row runs `download_media` with the picked quality. yt-dlp uses the right
   flags, merging/extracting via ffmpeg:
   - `mp4` @ height H: `-f "bv*[height<=H]+ba/b[height<=H]" --merge-output-format mp4`
   - `mp3` @ B kbps: `-x --audio-format mp3 --audio-quality {B}K`
3. **Live progress.** The command `spawn`s yt-dlp (not `output`) and streams
   `--progress --newline --progress-template "download:PROG|…"` (yt-dlp writes these lines to
   stdout, alongside the final `--print` path) back to the UI over a Tauri
   `Channel<DownloadProgress>`. MP4 downloads in two phases (video then audio), so the percent
   restarts once; the merge step has no byte progress.
4. `--ffmpeg-location <exe dir>` points yt-dlp at the bundled ffmpeg (works off-PATH).
   Output goes to the Downloads dir; the final path is returned (`--print after_move:filepath`,
   read off stdout).

---

## 2. Engine Contract (Rust commands)

```rust
// download.rs
#[tauri::command]
async fn probe_media(app: AppHandle, url: String) -> Result<MediaProbe, String>;

#[tauri::command]
async fn download_media(
    app: AppHandle,
    url: String,
    format: String,             // "mp4" | "mp3"
    height: Option<u32>,        // MP4 resolution cap
    audio_bitrate: Option<u32>, // MP3 kbps
    on_progress: Channel<DownloadProgress>, // live progress to the UI
) -> Result<String, String>;
```

```rust
struct MediaProbe { title: String, thumbnail: Option<String>, duration: Option<f64>,
                    video: Vec<VideoOption> }
struct VideoOption { height: u32, label: String, ext: String, filesize: Option<u64> }
struct DownloadProgress { percent: f64, downloaded: u64, total: Option<u64> }
```

- Both validate `url` is http(s) before spawning. `probe_media` returns the stderr tail on a
  non-zero exit (blocked/private/removed); `download_media` resolves Downloads via
  `app.path().download_dir()`, streams yt-dlp's **stdout** lines (the progress template + the
  final `--print` path) → `parse_progress` / path, keeps the last stderr line for the error
  message, and returns the saved path or the stderr tail on a non-zero `Terminated` code.
- Pure, cargo-tested: `parse_probe` (JSON → `MediaProbe`, dedupes height keeping the largest
  estimate, adds best-audio size), `build_ytdlp_args` (height cap + audio bitrate + progress
  flags), and `parse_progress` (`PROG|` line → percent, estimate fallback).

`yt-dlp` and `ffmpeg` are declared as `externalBin` in `tauri.conf.json` and allowed by scoped
shell capabilities (`args: true`): both get `shell:allow-execute`; **only `yt-dlp`** also gets
`shell:allow-spawn` (the download streams progress via `spawn`, while every ffmpeg call uses
`output`). Binaries are placed in `app/src-tauri/binaries/` (per-target-triple suffix) by
`scripts/fetch-binaries.mjs`.

UI wrappers: `app/src/lib/media.ts` → `probeMedia`, `downloadMedia` (optional `onProgress`
callback wired to a `Channel`), `MP3_BITRATES`, `mp3SizeEstimate`.

---

## 3. UI (`Download` tab)

URL input + **Search** button. After a successful probe: a result card with thumbnail + title,
**Video (MP4)** / **Audio (MP3)** tabs, and a quality table (columns: Quality, Format, Size,
Download). Each row downloads independently; one busy row at a time.

Feedback (so the outcome is never missed): while a download runs, a banner above the table
shows a **progress bar** with percent + downloaded/total (determinate when the size is known,
an indeterminate pulse otherwise) and the row's button reads "Saving…". yt-dlp reports no bytes
during the ffmpeg post-processing step, so when the byte stream goes quiet (>700 ms) the banner
switches to an indeterminate **"Converting to MP3…" / "Merging…"** pulse (labelled from the
format) instead of a frozen 100 % bar. On completion the banner turns green ("✓ Saved to
<path>") or red ("✕ <error>") and the acting row shows a "✓ Saved" / "✕ Failed" marker. Semantic `--color-success` / `--color-danger` theme tokens drive
the colors. A short legal note follows (respect each site's terms; you are responsible for what
you download).

---

## 4. Edge Cases

| Scenario | Expected |
|---|---|
| Invalid / non-http URL | Search/Download disabled or rejected before spawning |
| yt-dlp probe non-zero exit (blocked/private/removed) | inline "Could not read this link" + stderr tail |
| No video formats (audio-only source) | empty Video tab message; MP3 tiers still offered |
| Missing `filesize`/`filesize_approx` | size cell shows "—" |
| Unknown duration | MP3 size estimates show "—" |
| yt-dlp download non-zero exit | red banner error from the stderr tail |
| Unknown total size (live/streamed) | progress bar falls back to an indeterminate pulse |
| MP4 two-phase download | percent restarts (video → audio) |
| ffmpeg post-processing (transcode/merge) | no byte progress → indeterminate "Converting…/Merging…" pulse after a 700 ms quiet gap |
| Login required | surfaced as a yt-dlp error; cookies out of scope for V1 |
| ffmpeg/yt-dlp sidecar missing | `Err` (sidecar not found) |

---

## 5. Out of Scope (V1)

- In-app folder picker, playlists/batch, formats beyond MP4/MP3, native audio passthrough
  (m4a/opus rows). Cookie/login support, subtitles, thumbnails. Any hosted download service
  (never; ADR-003).
