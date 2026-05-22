# Video Edit Feature Spec

> **Status**: Implemented (shipped)
> **Last updated**: 2026-05-22
> **Environment**: desktop (native)

Edit the user's own video files with the bundled **native ffmpeg** sidecar, in a dedicated
**Video** tab: **trim** to a range, **merge** clips, **add audio** (replace the track),
**rotate** the orientation, **mirror** (flip), and change the **speed**. Everything runs on the
user's machine — no uploads.

**Scope decisions** (locked at design time):

- **Native ffmpeg** (sidecar) — one pass per edit.
- **Trim is lossless** (`-c copy`, fast keyframe seek). Mirror/rotate/speed re-encode video
  (they apply a filter); audio is stream-copied where it is untouched.
- **Merge = concat demuxer with `-c copy`** — fast and lossless, but the clips **must share the
  same codec/resolution/format** (e.g. clips from one camera/source). Re-encode merge for mixed
  inputs is out of scope (V1). The UI states the "same format" requirement.
- **Add audio = replace** the video's audio with the chosen audio file (`-shortest`), encoded to
  AAC. Mixing with the original track is out of scope (V1).
- **Write beside the input** with a suffix (same container/extension); **merge** uses a save
  dialog (combining many inputs → an explicit destination).

---

## 1. Supported Formats / Inputs

In (video): `mp4`, `mov`, `mkv`, `avi`, `webm`. Add-audio also takes an audio file
(`mp3`, `wav`, `m4a`, `flac`, `aac`, `ogg`).
Out: **same extension as the (first) video input**.

Engine: the bundled **ffmpeg** sidecar for every edit; `probe_duration` (ffmpeg) feeds the trim
UI's total length.

---

## 2. Engine Contract (Rust commands)

```rust
// video_edit.rs — each returns the saved path.
#[tauri::command]
async fn trim_video(app, path: String, start: f64, end: f64) -> Result<String, String>;
#[tauri::command]
async fn merge_videos(app, paths: Vec<String>, out: String) -> Result<String, String>;
#[tauri::command]
async fn add_audio_to_video(app, video: String, audio: String) -> Result<String, String>;
#[tauri::command]
async fn rotate_video(app, path: String, degrees: u32) -> Result<String, String>;
#[tauri::command]
async fn mirror_video(app, path: String, direction: String) -> Result<String, String>;
#[tauri::command]
async fn change_video_speed(app, path: String, factor: f64) -> Result<String, String>;

// pure, unit-tested arg/filter builders
fn video_trim_args / merge_args / add_audio_args / rotate_args / mirror_args / video_speed_args;
fn concat_list(paths: &[String]) -> String;  // ffmpeg concat-demuxer list-file body
fn rotate_filter(degrees: u32) -> Option<String>;
fn mirror_filter(direction: &str) -> Option<&str>;
fn video_speed_filter(factor: f64) -> String; // setpts + atempo_chain
```

ffmpeg invocations (all via `run_ffmpeg`, non-zero exit → stderr-tail `Err`):

- **Trim**: `ffmpeg -y -ss <start> -i <in> -t <end-start> -c copy <out>` — fast seek + stream
  copy (cut snaps to the nearest keyframe ≤ start; documented).
- **Merge**: write a temp concat list (`file '<path>'` per input, single-quotes escaped), then
  `ffmpeg -y -f concat -safe 0 -i <list> -c copy <out>`; the temp list is removed after.
- **Add audio**: `ffmpeg -y -i <video> -i <audio> -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac
  -shortest <out>`.
- **Rotate**: `ffmpeg -y -i <in> -vf <rotate_filter(degrees)> -c:a copy <out>`.
- **Mirror**: `ffmpeg -y -i <in> -vf <hflip|vflip> -c:a copy <out>`.
- **Speed**: `ffmpeg -y -i <in> -filter_complex <video_speed_filter> -map [v] -map [a] <out>`.

UI wrappers: `app/src/lib/videoEdit.ts` (one per command + `VIDEO_EXTENSIONS`).

---

## 3. Business Rules

1. **Output name** = base + suffix + the input's extension, beside the input (`with_suffix`):
   trim `-trimmed`, add-audio `-audio`, rotate `-rotated`, mirror `-mirrored`, speed `-speed`.
   **Merge** writes to the user-chosen `out` path.
2. **Trim range** `0 <= start < end` else `Err("invalid trim range")`; copies `end-start`
   seconds from `start` (`-c copy`, lossless).
3. **Merge** needs `paths.len() >= 2` else `Err("need at least two videos")`. Order = list
   order. Clips must share codec/resolution/format (concat copy); a mismatch surfaces as the
   ffmpeg stderr tail.
4. **Add audio** replaces the video's audio with the audio file, AAC-encoded, ending at the
   shorter stream (`-shortest`). Video is stream-copied (`-c:v copy`).
5. **Rotate** accepts `90` / `180` / `270` (clockwise) → `transpose=1` / `transpose=1,transpose=1`
   / `transpose=2`; any other value → `Err("unsupported rotation")`.
6. **Mirror** accepts `"horizontal"` (`hflip`) / `"vertical"` (`vflip`); else
   `Err("unsupported mirror direction")`.
7. **Speed** factor `0.5..=2.0` (V1) else `Err("speed out of range")`. Filter sets video
   `setpts=(1/factor)*PTS` and audio `atempo_chain(factor)`; the source **must have an audio
   track** (documented edge case).
8. **Failure** surfaces the ffmpeg stderr tail.

---

## 4. Options & Defaults

| Option | Type | Range / values | Default | Effect |
|---|---|---|---|---|
| Trim start / end | seconds (f64) | `0 <= start < end <= duration` | whole clip | window kept |
| Merge order | list | ≥ 2 clips | pick order | concatenation order |
| Add audio | two files | video + audio | — | replaces the video's track |
| Rotate | degrees | `90` / `180` / `270` | `90` | clockwise rotation |
| Mirror | direction | `horizontal` / `vertical` | `horizontal` | flip axis |
| Speed | factor (f64) | `0.5`–`2.0` | `1.0` | playback speed (audio retimed) |

UI disables invalid states; the engine re-checks every rule defensively.

---

## 5. Threading / Performance

`async` commands, one ffmpeg pass each. Trim/merge are stream-copy (fast); rotate/mirror/speed
and add-audio re-encode at least one stream. No progress streaming in V1 (busy state).

---

## 6. UI States

```
Idle (drop zone) → Picked (file(s) + controls) → Working(busy) → Done(saved path) | Error(stderr tail)
```

New **Video** tab with mode pills: **Trim · Merge · Add audio · Rotate · Mirror · Speed**.
Single-file modes mirror the audio edits (drop/pick → control → run → `Saved:`/`Failed:`).
Merge shows an ordered, removable list and a save dialog. Add audio shows two pickers
(video, then audio).

---

## 7. Edge Cases

| Scenario | Expected behavior |
|---|---|
| ffmpeg sidecar missing | `Err` (sidecar not found) |
| Merge clips differ in codec/size | ffmpeg stderr tail surfaces (concat copy can't mix) |
| Speed on a silent video | `Err` (no `[0:a]`); documented "needs an audio track" |
| Trim `start >= end` | `Err("invalid trim range")` (no spawn) |
| Unsupported rotate/mirror value | `Err("unsupported …")` (no spawn) |
| Merge with < 2 clips | `Err("need at least two videos")` (no spawn) |

---

## 8. Testing Checklist

- **Rust** (`cargo test`):
  - [x] `concat_list` — one `file '…'` line per path; single-quote escaping.
  - [x] `rotate_filter` (90/180/270 + invalid) and `mirror_filter` (h/v + invalid).
  - [x] `video_speed_filter` — `setpts` factor + `atempo` chain.
  - [x] trim / merge / add-audio / rotate / mirror / speed arg builders.
  - [x] range + value validation returns the documented `Err` strings.
- **Manual / runtime** (needs the ffmpeg sidecar):
  - [ ] trim; merge two same-format clips; add audio to a clip; rotate 90/180/270; flip h/v;
        0.5×/2× speed — outputs play and land at the expected path.

---

## 9. Out of Scope (this version)

- Re-encode merge for mixed-format clips (concat filter), transitions/crossfade.
- Mixing added audio with the original track; audio offset/trim while muxing.
- Resize/scale, crop, watermark, format transcode, GIF export.
- Progress streaming; per-frame preview; video thumbnails in the merge list.
