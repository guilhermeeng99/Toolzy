# Media Convert Feature Spec

> **Status**: Shipped (native). Audio targets via the ffmpeg sidecar.
> **Last updated**: 2026-05-22
> **Environment**: desktop (native)

Convert the user's own audio/video files to audio formats using the bundled **native ffmpeg**
sidecar. Headline case: **MP4 → MP3** (extract audio). Distinct from the downloader, which
fetches media from a link.

**Scope decisions:**

- **Native ffmpeg** (sidecar) — fast, no WASM, no memory ceiling.
- **Audio targets in V1**: `mp3`, `m4a`, `wav`. Video transcode deferred.
- **Batch** (multi-file + drag-drop); each file reports its own status.

---

## 1. Formats

In: any `audio/*` or `video/*` ffmpeg can demux (mp4, mov, mkv, avi, webm, mp3, wav, …).
Out: `mp3` (libmp3lame `-q:a 2`), `m4a` (native `aac -b:a 192k`), `wav` (`pcm_s16le`).

---

## 2. Engine Contract (Rust command)

```rust
// media.rs
#[tauri::command]
async fn convert_media(app: AppHandle, path: String, target: String) -> Result<String, String>;
```

- Builds `ffmpeg -y -i <path> -vn <codec…> <out>` (`-vn` drops video), runs the **ffmpeg
  sidecar** (`app.shell().sidecar("ffmpeg")`), writes `base.<target>` beside the input, returns
  the path. Non-zero exit → `Err` with the stderr tail.
- Requires the bundled `ffmpeg` sidecar at runtime.

UI wrapper: `app/src/lib/media.ts` → `convertMedia`.

---

## 3. Business Rules

1. **`-vn`** drops any video stream; output is audio only.
2. **Output name** = input base name + new extension, in the input's directory.
3. **Codecs**: mp3 = `libmp3lame -q:a 2`; m4a = native `aac -b:a 192k`; wav = `pcm_s16le`.
4. **Unsupported target** → `Err` before spawning.
5. **Batch** sequential; one failure doesn't stop the rest.

---

## 4. UI (`Audio` tab → Convert mode)

The default mode of the **Audio** tab (siblings: Trim / Volume / Speed — see
[audio-edit](audio-edit.md)). Choose target (mp3/m4a/wav), pick or drop audio/video files,
Convert; per-file status + saved path. "Converted natively with ffmpeg, on your device."

---

## 5. Edge Cases

| Scenario | Expected |
|---|---|
| ffmpeg sidecar missing | `Err` (sidecar not found) |
| Unsupported/corrupt media | `Err` with ffmpeg stderr tail |
| Unknown target | `Err("unsupported target: …")` |

---

## 6. Testing Checklist

- **Manual / runtime**: MP4 → MP3 happy path (needs the ffmpeg sidecar). Codec arg shape is
  simple and reviewed.

---

## 7. Out of Scope (V1)

- Video transcoding (mp4 → webm/gif, resize, trim). Bitrate/sample-rate controls. Progress
  streaming (V1 shows a busy state).
