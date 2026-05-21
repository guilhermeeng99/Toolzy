# Media Downloader Feature Spec

> **Status**: Shipped (native). yt-dlp + ffmpeg sidecars.
> **Last updated**: 2026-05-21
> **Environment**: desktop (native)

Download audio/video from a link as MP4 or MP3 using `yt-dlp` + `ffmpeg` that run on the
**user's own machine and residential IP**. See
[ADR-003](architecture.md#adr-003-the-downloader-runs-on-the-users-machine): no hosted server,
so no datacenter-IP blocking and no ToS/legal exposure for the project.

**Scope decisions:**

- **Sidecars, not linking.** `yt-dlp` + `ffmpeg` are Tauri sidecars (separate processes).
- **`yt-dlp` auto-updates** via `scripts/fetch-binaries.mjs` (decoupled from app releases).
- **Saves to the OS Downloads folder** in V1 (no in-app folder picker).

---

## 1. Behavior

- Input: a media URL + a target (`mp4` best video+audio, or `mp3` audio only).
- yt-dlp runs with the right flags, merging/extracting via ffmpeg:
  - `mp4`: `-f "bv*+ba/b" --merge-output-format mp4`
  - `mp3`: `-x --audio-format mp3`
- `--ffmpeg-location <exe dir>` points yt-dlp at the bundled ffmpeg (works off-PATH).
- Output goes to the Downloads dir; the final file path is returned
  (`--print after_move:filepath`).

---

## 2. Engine Contract (Rust command)

```rust
// download.rs
#[tauri::command]
async fn download_media(app: AppHandle, url: String, format: String) -> Result<String, String>;
```

- Validates `url` is http(s); resolves Downloads via `app.path().download_dir()`; runs the
  yt-dlp sidecar; returns the saved file path, or the stderr tail on non-zero exit.
- `build_ytdlp_args` (pure) is unit-tested (`cargo test`).

`yt-dlp` and `ffmpeg` are declared as `externalBin` in `tauri.conf.json` and allowed by a
scoped `shell:allow-execute` capability; placed in `app/src-tauri/binaries/` (per-target-triple
suffix) by `scripts/fetch-binaries.mjs`.

UI wrapper: `app/src/lib/media.ts` → `downloadMedia`.

---

## 3. UI (`Download` tab)

URL input, MP4/MP3 toggle, Download button, status line (saved path or error), and a short
legal note (respect each site's terms; you are responsible for what you download).

---

## 4. Edge Cases

| Scenario | Expected |
|---|---|
| Invalid / non-http URL | rejected before spawning, inline error |
| yt-dlp non-zero exit (blocked/private/removed) | error message from the stderr tail |
| Login required | surfaced as a yt-dlp error; cookies out of scope for V1 |
| ffmpeg/yt-dlp sidecar missing | `Err` (sidecar not found) |

---

## 5. Out of Scope (V1)

- In-app folder picker, playlists/batch, formats beyond MP4/MP3. Cookie/login support,
  subtitles, thumbnails. Live progress streaming. Any hosted download service (never; ADR-003).
