# Multi-site Media Downloader Feature Spec

> **Status**: Shipped (native); multi-site/batch expansion in progress.
> **Last updated**: 2026-07-13
> **Environment**: desktop (native)

Download public or user-authorized audio/video as MP4 or MP3 from sites supported by `yt-dlp`.
`yt-dlp` and `ffmpeg` run on the user's machine and connection; Toolzy has no download server.
See [ADR-003](architecture.md#adr-003-the-downloader-runs-on-the-users-machine).

## 1. Scope and product language

- Say **"1,000+ sites supported by yt-dlp"**, not "any link". Extractors can break when sites
  change, and DRM, removed media, geo restrictions, authentication, or a site's terms can still
  prevent a download.
- Supported inputs are one or more HTTP(S) URLs, one per line. A URL may point to one media item
  or a playlist/collection.
- Duplicate URLs are removed while preserving first-seen order. Playlist expansion is capped at
  100 items per input URL to prevent accidental unbounded work.
- Downloads and probes stay local. Browser cookies are read only when the user explicitly selects
  a supported browser; they are passed directly to `yt-dlp` and never enter Toolzy storage or IPC
  responses.
- Output is saved to the OS Downloads folder. A folder picker, subtitles, and thumbnails-as-files
  remain out of scope.

## 2. Behavior

1. **Analyze** parses input lines, validates HTTP(S), expands playlists with
   `expand_media_urls`, deduplicates the expanded results, then probes each item with
   `probe_media`.
2. Each successful probe shows title, thumbnail, source extractor, duration, and selectable
   output options:
   - **Video (MP4)**: one row per distinct height, high to low. Sources with video but no reported
     height receive a **Best available** fallback row.
   - **Audio (MP3)**: 320/256/192/128/96/64 kbps. Size is estimated from duration. Audio-only
     sources automatically default to MP3.
3. **Download selected** processes one item. **Download all** processes ready items sequentially,
   using each item's selected format/quality. Sequential execution limits traffic, CPU use, and
   post-processing contention while retaining live progress for the active item.
4. MP3 explicitly selects best audio (`ba/b`) before extraction. MP4 prefers H.264/AAC, merges to
   MP4 when possible, then remuxes or recodes when required so the final extension is MP4.
5. Progress is streamed from `yt-dlp` through `Channel<DownloadProgress>`. When byte progress goes
   quiet during ffmpeg post-processing, the UI switches to an indeterminate finishing state.
6. Errors are categorized into actionable messages for unsupported URLs, authentication/cookies,
   DRM, unavailable media, geo restrictions, rate limits, and generic extractor failures.

## 3. Engine contract

```rust
#[tauri::command]
async fn expand_media_urls(
    app: AppHandle,
    url: String,
    cookie_browser: Option<String>,
) -> Result<Vec<String>, String>;

#[tauri::command]
async fn probe_media(
    app: AppHandle,
    url: String,
    cookie_browser: Option<String>,
) -> Result<MediaProbe, String>;

#[tauri::command]
async fn download_media(
    app: AppHandle,
    url: String,
    format: String,             // "mp4" | "mp3"
    height: Option<u32>,        // MP4 resolution cap; None = best available
    audio_bitrate: Option<u32>, // MP3 kbps
    cookie_browser: Option<String>,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String>;
```

```rust
struct MediaProbe {
    title: String,
    thumbnail: Option<String>,
    duration: Option<f64>,
    source: String,
    has_audio: bool,
    video: Vec<VideoOption>,
}

struct VideoOption {
    height: Option<u32>,
    label: String,
    ext: String,
    filesize: Option<u64>,
}
```

Engine rules:

- Parse URLs with `url::Url`; accept only `http`/`https` with a host.
- Accept only allow-listed cookie browsers: `brave`, `chrome`, `edge`, `firefox`, `chromium`,
  `opera`, `safari`, and `vivaldi`.
- Every invocation includes `--ignore-config` so a user's global `yt-dlp.conf` cannot silently
  change Toolzy behavior.
- `expand_media_urls` uses flat extraction and prints canonical `webpage_url` values; invalid or
  missing printed values fall back to the validated original URL.
- `probe_media` always uses `--no-playlist --dump-single-json`.
- `download_media` always uses `--no-playlist`, the bundled ffmpeg directory, a deterministic
  output template, progress flags, and `after_move:filepath`.
- Pure helpers for validation, cookie arguments, URL expansion, error mapping, probe parsing,
  download arguments, and progress parsing require Rust unit tests.

## 4. UI contract

- Multiline URL textarea, **Analyze** button, and optional **Use cookies from** browser selector.
- Choosing a browser displays a privacy note before analysis/download.
- Analysis summary reports unique media found and duplicates removed.
- Each media card has its own MP4/MP3 selection, quality rows, progress/result state, retry path,
  and **Download selected** action.
- **Download all** appears for multiple ready items, runs a sequential queue, continues after an
  item failure, and leaves a visible success/failure result on every item.
- Legal copy: only download content the user owns or is allowed to download; site terms and local
  law remain the user's responsibility.

## 5. Edge cases

| Scenario | Expected |
|---|---|
| Blank/invalid/non-HTTP input | rejected before spawning a sidecar |
| Duplicate input or playlist entry | one retained item; removed count shown |
| Playlist larger than 100 entries | first 100 expanded; UI mentions the limit |
| Audio-only source | defaults to MP3; Video tab explains no video was reported |
| Video without height metadata | one **Best available** MP4 option |
| Unknown size/duration | size displays `—`; download still allowed |
| Login/cookies required | actionable message suggesting explicit browser selection |
| Selected browser unavailable/locked | actionable cookie-read failure; no fallback to another browser |
| DRM | clear unsupported message; no bypass attempt |
| Geo restriction or rate limit | categorized retry/region message |
| One queued item fails | queue continues; failed item stays visible |
| ffmpeg post-processing | indeterminate finishing state after progress quiet period |

## 6. Distribution and freshness

`yt-dlp` is an extractor database as well as an executable and must stay fresh. Release builds run
`scripts/fetch-binaries.mjs`, which downloads the latest official binary. A weekly scheduled release
check compares the tracked upstream version; when it changes, Toolzy publishes a normal signed app
update containing the new sidecar. The bundled executable is never mutated in place at runtime.

The app and ReClip are MIT-compatible, but Toolzy does not embed ReClip's Flask backend. Ideas such
as batch input, deduplication, and playlist expansion are implemented natively in the existing
Rust/Tauri architecture.

## 7. Out of scope

- DRM circumvention, paywall bypass, credential collection, or a hosted/proxy download service.
- Automatic browser-cookie access without explicit user selection.
- More than 100 entries from one playlist in a single analysis.
- Parallel downloads, in-app output-folder selection, subtitles, or thumbnail downloads.
