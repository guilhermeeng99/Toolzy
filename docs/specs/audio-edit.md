# Audio Edit Feature Spec

> **Status**: Implemented (shipped)
> **Last updated**: 2026-05-22
> **Environment**: desktop (native)

Edit the user's own audio (or the audio of a media file) with the bundled **native ffmpeg**
sidecar: **trim** to a time range, change the **volume**, or change the **speed**. Lives as
modes inside the **Audio** tab, alongside the existing audio Convert. Distinct from the
downloader (fetches from a link) and from video editing (the Video tab).

**Scope decisions** (locked at design time):

- **Native ffmpeg** (sidecar) — one pass per edit, no WASM, no memory ceiling.
- **One file per edit** — trim/volume/speed each take a single picked file (params are
  per-file). Batch stays the Convert mode's job.
- **Write beside the input** — `base-trimmed.ext` / `base-volume.ext` / `base-speed.ext`,
  same container/extension as the source. No save dialog (matches Convert).
- **Trim = keep a range** `[start, end]`. Cut-out-the-middle is out of scope (V1).

---

## 1. Supported Formats / Inputs

In: audio files ffmpeg can demux — `mp3`, `wav`, `m4a`, `flac`, `aac`, `ogg`.
Out: **same extension as the input** (each edit re-encodes; ffmpeg picks the encoder from the
output extension).

Engine: the bundled **ffmpeg** sidecar (`app.shell().sidecar("ffmpeg")`) for every edit, plus
`probe_duration` (also ffmpeg) to read the source length for the trim UI.

---

## 2. Engine Contract (Rust commands)

```rust
// audio_edit.rs — each writes `base-<suffix>.<ext>` beside the input, returns its path.
#[tauri::command]
async fn trim_audio(app: AppHandle, path: String, start: f64, end: f64) -> Result<String, String>;
#[tauri::command]
async fn change_audio_volume(app: AppHandle, path: String, percent: u32) -> Result<String, String>;
#[tauri::command]
async fn change_audio_speed(app: AppHandle, path: String, factor: f64) -> Result<String, String>;

// ffmpeg.rs — shared
async fn run_ffmpeg(app: &AppHandle, args: Vec<String>) -> Result<(), String>;
fn with_suffix(src: &Path, suffix: &str) -> PathBuf;   // base.ext + "x" -> base-x.ext
fn atempo_chain(factor: f64) -> String;                // 4.0 -> "atempo=2.0,atempo=2.0"
#[tauri::command]
async fn probe_duration(app: AppHandle, path: String) -> Result<f64, String>; // seconds
```

- **Trim** builds `ffmpeg -y -i <in> -ss <start> -to <end> <out>` (seek **after** `-i` so the
  cut is accurate; re-encodes via the extension's default encoder).
- **Volume** builds `ffmpeg -y -i <in> -filter:a volume=<percent/100> <out>`.
- **Speed** builds `ffmpeg -y -i <in> -filter:a <atempo_chain(factor)> <out>`.
- Non-zero ffmpeg exit → `Err` with the stderr tail (via `run_ffmpeg`).

UI wrappers: `app/src/lib/audioEdit.ts` (`trimAudio`, `changeAudioVolume`, `changeAudioSpeed`)
and `app/src/lib/media.ts` (`probeDuration`, `AUDIO_EXTENSIONS`).

---

## 3. Business Rules

Numbered, testable.

1. **Output name** = input base + suffix + the **input's** extension, in the input's directory
   (`with_suffix`): trim → `-trimmed`, volume → `-volume`, speed → `-speed`.
2. **Trim range** must satisfy `0 <= start < end`; otherwise `Err("invalid trim range")` before
   spawning. `-ss`/`-to` are placed after `-i` for an accurate cut.
3. **Volume** is a percentage: `0` mutes, `100` is unchanged, up to `400`. Out of `0..=400` →
   `Err("volume out of range")`. Filter arg = `volume=<percent/100>` (e.g. `150` → `volume=1.5`).
4. **Speed** factor is `0.5..=2.0` (V1); out of range → `Err("speed out of range")`. The arg is
   `atempo_chain(factor)`. `atempo_chain` is general (chains 0.5/2.0 steps for factors beyond the
   range) so it stays correct if the range widens later.
5. **probe_duration** parses the `Duration: HH:MM:SS.xx` line ffmpeg prints to stderr → seconds;
   no such line → `Err("could not read duration")`.
6. **Failure** surfaces the ffmpeg stderr tail (`run_ffmpeg`).

---

## 4. Options & Defaults

| Option | Type | Range | Default | Effect |
|---|---|---|---|---|
| Trim start / end | seconds (f64) | `0 <= start < end <= duration` | whole file | window kept |
| Volume | percent (u32) | `0`–`400` | `100` | gain (`100` = unchanged) |
| Speed | factor (f64) | `0.5`–`2.0` | `1.0` | tempo (pitch preserved by `atempo`) |

The trim UI knows the total length from `probe_duration` and clamps the fields; the engine
re-checks every range defensively (rules 2–4).

---

## 5. Threading / Performance

`async` commands; one ffmpeg pass per edit. No progress streaming in V1 (UI shows a busy
state). Single file at a time per edit mode.

---

## 6. UI States

```
Idle (drop zone) → Picked (file + controls) → Working(busy) → Done(saved path) | Error(stderr tail)
```

- **Idle**: drop zone — "Drop an audio file here, or click to choose".
- **Picked**: file name + the mode's control (trim range with total duration / volume slider /
  speed slider) + a primary action button.
- **Done / Error**: one line — `Saved: <path>` or `Failed: <stderr tail>`.

Lives under the **Audio** tab's mode pills: **Convert · Trim · Volume · Speed**.

---

## 7. Edge Cases

| Scenario | Expected behavior |
|---|---|
| ffmpeg sidecar missing | `Err` (sidecar not found) |
| Corrupt / unreadable audio | `Err` with ffmpeg stderr tail |
| Trim `start >= end` or negative | `Err("invalid trim range")` (no spawn) |
| Volume outside `0..=400` | `Err("volume out of range")` (no spawn) |
| Speed outside `0.5..=2.0` | `Err("speed out of range")` (no spawn) |
| Duration line absent (exotic input) | `probe_duration` → `Err`; UI keeps fields unclamped |

---

## 8. Testing Checklist

- **Rust** (`cargo test`):
  - [x] `with_suffix` keeps directory + extension, inserts the suffix.
  - [x] `atempo_chain` — single step inside `0.5..=2.0`; chained steps beyond (e.g. `4.0`, `0.25`).
  - [x] `parse_duration` — `HH:MM:SS.xx` → seconds; missing line → `None`.
  - [x] volume / speed / trim arg builders produce the expected `filter:a` / `-ss`/`-to` args.
  - [x] range validation returns the documented `Err` strings.
- **Manual / runtime** (needs the ffmpeg sidecar):
  - [ ] trim a clip; volume up/down; 0.5×/2× speed — output plays + lands beside the input.

---

## 9. Out of Scope (this version)

- Cut-out-the-middle / multi-segment trim, fades, normalization, channel/sample-rate controls.
- Batch edits (same volume/speed across many files).
- Progress streaming.
- Editing the audio track *inside* a video here (that is the Video tab's "Add audio").
