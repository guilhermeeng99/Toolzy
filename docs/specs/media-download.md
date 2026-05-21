# Media Downloader Feature Spec

> **Status**: Draft (Phase 4)
> **Last updated**: 2026-05-21
> **Coverage**: Behavior, Desktop command, Capability detection, UI, Edge cases
> **Environment**: desktop only (Tauri). The web build shows a "get the app" placeholder.

Download audio/video from a link as MP4 or MP3, using `yt-dlp` + `ffmpeg` that run on the
**user's own machine and residential IP**. See
[ADR-003](architecture.md#adr-003-the-downloader-is-desktop-only): there is no hosted server,
so no datacenter-IP blocking and no ToS/legal exposure for the project.

**Scope decisions** (locked):

- **Desktop only.** The same React UI ships in both builds; the download route detects the
  environment. In the web build it renders a placeholder linking to the desktop release.
- **Sidecars, not linking.** `yt-dlp` and `ffmpeg` are bundled as Tauri sidecars (separate
  executables invoked as child processes), keeping the app's MIT license clean.
- **`yt-dlp` auto-updates.** It breaks often; a refresh of the binary is decoupled from app
  releases (a `yt-dlp -U` step or a fetch script).
- **Saves to the user's Downloads folder** in V1 (no in-app folder picker yet).

---

## 1. Behavior

- Input: a media URL + a target (`mp4` best video+audio, or `mp3` audio only).
- The desktop command runs `yt-dlp` with the right flags, merging via `ffmpeg`:
  - `mp4`: `-f "bv*+ba/b" --merge-output-format mp4`
  - `mp3`: `-x --audio-format mp3`
- Output is written to the OS Downloads directory; the saved path is returned to the UI.
- Progress is streamed from `yt-dlp` stdout to the UI (later; V1 may show indeterminate).

---

## 2. Desktop command (Rust / Tauri)

```rust
#[tauri::command]
async fn download_media(app: AppHandle, url: String, format: String) -> Result<String, String>;
```

- Validates `url` is http(s).
- Resolves the Downloads dir via Tauri's path API (`app.path().download_dir()`).
- Spawns the `yt-dlp` sidecar (via `tauri-plugin-shell`) with `--ffmpeg-location` pointing at
  the bundled `ffmpeg` (the executable's own directory, where sidecars ship) and
  `-o <downloads>/%(title)s.%(ext)s`.
- Returns the final, post-processed file path on success (`--print after_move:filepath`,
  falling back to the Downloads folder), or the stderr tail on non-zero exit.

`yt-dlp` and `ffmpeg` are declared as `externalBin` in `tauri.conf.json` and placed in
`apps/desktop/src-tauri/binaries/` (per-target-triple suffix). `scripts/fetch-binaries.mjs`
downloads `yt-dlp` and prints where to fetch the matching `ffmpeg`.

---

## 3. Capability detection (web side)

```ts
// apps/web/lib/desktop.ts
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
export async function downloadMedia(url: string, format: "mp4" | "mp3"): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("download_media", { url, format });
}
```

`@tauri-apps/api` is only dynamically imported inside `downloadMedia`, so the web bundle never
loads it and the web build stays clean.

---

## 4. UI (`/tools/download`)

- **Web build** (`isDesktop() === false`): a card explaining the downloader runs in the
  desktop app, with a button to the GitHub Releases page. No URL field.
- **Desktop build**: URL input, MP4/MP3 toggle, Download button, status line (saved path or
  error). A short legal note: respect the source site's terms; you are responsible for what
  you download.

---

## 5. Edge Cases

| Scenario | Expected |
|---|---|
| Invalid / non-http URL | rejected before spawning, inline error |
| `yt-dlp` non-zero exit (blocked, private, removed) | error message from stderr tail |
| Site requires login | surfaced as a yt-dlp error; cookies are out of scope for V1 |
| Network offline | yt-dlp error; retry |
| Web build visits the route | placeholder + release link, no download attempt |

---

## 6. Out of Scope (V1)

- In-app folder picker, playlist/batch downloads, format/quality matrix beyond MP4/MP3.
- Cookie/login support, subtitle download, embedded thumbnails.
- A hosted/public download service (explicitly never; ADR-003).

---

## 7. Build & distribution

- `pnpm desktop:dev` runs Tauri against the web dev server; `pnpm desktop:build` produces a
  signed installer per OS (CI matrix later, publishing to GitHub Releases).
- Requires the Rust toolchain and the platform's Tauri prerequisites, plus the sidecar
  binaries fetched into `src-tauri/binaries/`.
