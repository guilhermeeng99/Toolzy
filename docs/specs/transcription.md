# Transcription Feature Spec

> **Status**: Implemented (verified on Windows incl. NVIDIA GPU; macOS/Linux engine fetch pending)
> **Last updated**: 2026-05-25
> **Environment**: desktop (native)

Turn an audio (or video) file into text **on the user's machine** using a bundled **Whisper**
engine. The user picks a file, Toolzy preprocesses it with the existing **ffmpeg** sidecar
(→ 16 kHz mono WAV), runs Whisper, and writes the transcript beside the input (plain text,
SRT, VTT, or JSON). Lives as a **Transcribe** mode in the **Audio** tab. No uploads, no account — same privacy
guarantee as every other tool.

**Why Whisper (not Parakeet/Canary)**: faithful **pt-BR** is the goal. Whisper is trained on
broad multilingual data with strong Brazilian-Portuguese coverage; NVIDIA's Parakeet/Canary are
trained on **European** Portuguese (NVIDIA's own model cards note the pt-BR benchmark drop) and
Parakeet is ASR-only. Whisper also covers ~99 languages and integrates as a clean self-contained
engine. See the conversation thread / [architecture ADR](architecture.md) for the comparison.

**Priority** (the user's words): **correctness over speed** — a run may take as long as it needs
on CPU, but the transcript must be faithful and **must not hallucinate** (Whisper's known failure
mode: inventing or looping text over silence/noise). Every decision below favours fidelity over
latency.

**Scope decisions** (locked at design time — 2026-05-25):

- **Engine — `whisper-cli` sidecar.** Matches the existing ffmpeg/yt-dlp/qpdf pattern
  (`externalBin` + a `shell:allow-execute` capability) and gives txt/srt/vtt/json for free via CLI
  flags. (The `whisper-rs` crate was considered — compiled-in, matches the "prefer a crate"
  principle — but adds a C++/cmake build to CI and hand-rolled SRT/VTT. Revisit later if a single
  binary-free cross-platform build is wanted.)
- **Default model — `large-v3` (max fidelity).** Speed is not a priority, so v1 defaults to the
  most accurate model rather than the faster `large-v3-turbo` (kept as a selectable "faster,
  slightly less faithful" option).
- **Anti-hallucination is a first-class requirement.** Recognition always runs with **Silero VAD**
  (transcribe only detected speech, so the model never invents text over silence),
  **deterministic decoding** (greedy, temperature 0), and **no conditioning on previous text**
  (`max-context 0`, stops repetition/drift loops). These are fixed engine settings, not user
  knobs. See rules 11–12.
- **Models download on demand.** Whisper models are 466 MB–3 GB; bundling bloats the installer.
  The app fetches the chosen model once (from `ggerganov/whisper.cpp` on Hugging Face) plus the
  small Silero VAD model, to an app-data dir, and reuses them. `fetch-binaries.mjs` fetches only
  the small **engine binary**, never a model.
- **CPU engine bundled; GPU optional, on demand.** The small CPU `whisper-cli` is bundled (works
  everywhere). On NVIDIA, the user can one-click download a self-contained **CUDA** build (~435 MB)
  to app-data; `transcribe_audio` then runs on the GPU (measured **≈7–10× faster** on 1–2 min
  clips). Keeps the installer small; CPU is the fallback (§5).
- **Transcription is the product.** Whisper's built-in `translate` task (any language →
  **English**) is supported by the command but **not surfaced in the v1 UI** (transcription only);
  translation **into** Portuguese / any non-English target needs a separate MT engine and is
  **out of scope** (§9).
- **Write beside the input** — `base.txt` / `base.srt` / … in the input's directory (matches
  audio-edit / convert). One file per run.

---

## 1. Supported Formats / Inputs

In: any audio or video file **ffmpeg can demux** — `mp3`, `wav`, `m4a`, `flac`, `aac`, `ogg`,
`opus` (audio) and `mp4`, `mkv`, `mov`, `webm` (video → audio track is extracted). Reuses the
extension lists in `lib/media.ts`.

Out (one selectable format per run):

| Format | Ext | Contents |
|---|---|---|
| Plain text | `.txt` | transcript, no timestamps (default) |
| SubRip | `.srt` | timestamped subtitle cues |
| WebVTT | `.vtt` | timestamped subtitle cues (web/video) |
| JSON | `.json` | segments + timestamps + detected language (machine-readable) |

Engine: **ffmpeg** sidecar for preprocessing (→ 16 kHz mono `s16le` WAV, Whisper's required
input), then the **`whisper-cli`** sidecar for recognition.

---

## 2. Engine Contract (Rust commands)

New module `transcription.rs`. Pure helpers (model registry, URL/filename, arg/output-path
builders) carry `#[cfg(test)]` tests; the commands shell out and do I/O.

```rust
// transcription.rs
#[derive(serde::Serialize)]            // rename_all = "camelCase"
struct TranscribeResult {
    text: String,        // transcript read back (for the UI preview)
    output_path: String, // saved file beside the input
    language: String,    // detected (or forced) language code
}

#[derive(serde::Serialize)]
struct WhisperModel { id: String, label: String, size_mb: u32, downloaded: bool }

// Transcribe a file. Preprocess → run whisper-cli → return text + saved path.
#[tauri::command]
async fn transcribe_audio(
    app: AppHandle,
    path: String,
    model: String,             // model id, e.g. "large-v3"
    language: Option<String>,  // None = auto-detect; Some("pt") to force
    task: Option<String>,      // "transcribe" (default) | "translate" (→ English)
    format: Option<String>,    // "txt" (default) | "srt" | "vtt" | "json"
    on_progress: Channel<TranscribeProgress>, // whisper-cli `--print-progress` % → UI
) -> Result<TranscribeResult, String>;

// Which models exist on disk (drives the UI picker / "needs download" state).
#[tauri::command]
fn list_whisper_models(app: AppHandle) -> Result<Vec<WhisperModel>, String>;

// Download a model once, streaming progress to the UI via a Channel (same pattern as yt-dlp).
#[tauri::command]
async fn download_whisper_model(
    app: AppHandle,
    model: String,
    on_progress: tauri::ipc::Channel<DownloadProgress>,
) -> Result<String, String>; // returns the saved model path

// Kill the running transcription (Cancel button).
#[tauri::command]
fn cancel_transcription(state: State<TranscribeState>) -> Result<(), String>;

// NVIDIA GPU engine — optional, downloaded on demand.
#[tauri::command]
fn gpu_engine_status(app: AppHandle) -> Result<GpuStatus, String>; // { gpuPresent, downloaded }
#[tauri::command]
async fn download_gpu_engine(app: AppHandle, on_progress: Channel<DownloadProgress>) -> Result<(), String>;

// pure helpers (cargo-tested)
fn model_url(id: &str) -> Option<String>;          // id -> HF resolve URL
fn model_filename(id: &str) -> Option<String>;     // id -> "ggml-<id>.bin"
fn whisper_args(wav: &Path, model: &Path, vad_model: &Path, out_base: &Path,
                language: Option<&str>, task: &str, format: &str, threads: usize) -> Vec<String>;
// always emits VAD + greedy/temperature 0 + max-context 0 (anti-hallucination; rules 11–12)
fn output_path(src: &Path, format: &str) -> PathBuf; // base.<format-ext>, beside input
```

- **Preprocess**: `ffmpeg -y -i <in> -ar 16000 -ac 1 -c:a pcm_s16le <temp.wav>` via the shared
  `run_ffmpeg` (ffmpeg.rs). The temp WAV is deleted after the run (success or failure).
- **Recognize**: `whisper-cli -m <model.bin> -f <temp.wav> -l <auto|code> [-tr] -o<fmt>
  -of <out_base>` **plus the fixed anti-hallucination flags**: VAD on with the Silero model
  (`--vad --vad-model <silero.bin>`), greedy/temperature 0, and `max-context 0` (exact flag
  spellings pinned to the bundled whisper-cli version at build). `-of` is the **original** file's
  base path (sans extension), so the transcript lands beside the input, not the temp WAV.
  Non-zero exit → `Err` with the stderr tail (via the shared sidecar runner).
- **Models** live under `app_data_dir()/models/ggml-<id>.bin`, with the Silero VAD model beside
  them. `transcribe_audio` returns `Err("model not downloaded: <id>")` if the chosen model is
  absent (the UI downloads first); the small VAD model is fetched once on first transcription.
- **Sidecar**: add `whisper-cli` to `externalBin` + a `shell:allow-execute` capability (Windows
  ships `whisper-cli.exe` + sibling DLLs — handle like qpdf in `fetch-binaries.mjs`).
- **GPU engine** (NVIDIA): `download_gpu_engine` fetches the self-contained CUDA build to
  `app_data_dir()/engine-cuda/`; when present, `transcribe_audio` runs that exe via a plain
  `std::process::Command` (it's outside the sidecar allow-list) and skips progress streaming (GPU
  is fast). `gpu_engine_status` reports the NVIDIA driver (nvcuda.dll) + install state.
- **Cancel**: the running child is kept in `TranscribeState` (managed Tauri state);
  `cancel_transcription` kills it. The UI suppresses the resulting error.

UI wrappers: `app/src/lib/transcribe.ts` (`transcribeAudio`, `listWhisperModels`,
`downloadWhisperModel`, `cancelTranscription`, `gpuEngineStatus`, `downloadGpuEngine`).

---

## 3. Business Rules

Numbered, testable.

1. **Preprocess to Whisper's input** — every run first transcodes the source to 16 kHz **mono**
   `pcm_s16le` WAV (ffmpeg). Anything ffmpeg can demux is accepted; a demux failure surfaces the
   ffmpeg stderr tail.
2. **Output name** = input base + the format's extension, in the input's directory
   (`output_path`): `txt`→`.txt`, `srt`→`.srt`, `vtt`→`.vtt`, `json`→`.json`. Default format =
   `txt`.
3. **Model required on disk** — `transcribe_audio` checks `models/ggml-<id>.bin` exists; if not →
   `Err("model not downloaded: <id>")` **before** spawning anything. `model_url`/`model_filename`
   return `None` for an unknown id → `Err("unknown model: <id>")`.
4. **Language** — `None` ⇒ `-l auto` (Whisper detects). `Some(code)` forces it (e.g. `pt`). The
   detected/forced code is returned in `TranscribeResult.language`.
5. **Task** — `transcribe` (default) keeps the source language. `translate` adds `-tr` (Whisper
   outputs **English** only). Any other value → `Err("unknown task: <task>")`.
6. **Format** — one of `txt|srt|vtt|json`; anything else → `Err("unknown format: <format>")`.
7. **Result text** — after a successful run the produced file is read back into
   `TranscribeResult.text` for the UI preview (empty file ⇒ empty string, still `Ok`).
8. **Temp cleanup** — the intermediate WAV is always removed (success or error).
9. **Download integrity** — `download_whisper_model` streams to a `.part` file, then renames on
   completion; a failed/cancelled download leaves no half model in place. Progress is reported
   via the `Channel`.
10. **Failure** surfaces the sidecar stderr tail (ffmpeg or whisper-cli), mapped to `Err(String)`.
11. **Silence gating (anti-hallucination)** — recognition always runs with **Silero VAD**, so only
    detected speech reaches Whisper; silent / non-speech spans cannot produce invented text. The
    VAD model is downloaded once (rule 3 applies to it too).
12. **Deterministic decoding (anti-hallucination)** — recognition always uses greedy decoding
    (temperature 0) and **no previous-text conditioning** (`max-context 0`) to prevent
    repetition/looping drift. Fixed, not user-tunable; `whisper_args` always emits them (tested).

---

## 4. Options & Defaults

| Option | Type | Range / values | Default | Effect |
|---|---|---|---|---|
| Model | enum id | see registry below | `large-v3` | accuracy ↔ size/speed trade-off |
| Language | code or auto | `auto` + ~99 codes | `auto` | force vs detect source language |
| Task | enum (command only) | `transcribe` · `translate` | `transcribe` | not surfaced in v1 UI; `translate` = → English only |
| Format | enum | `txt` · `srt` · `vtt` · `json` | `txt` | output file type |

**Model registry** (ggml, fetched from `huggingface.co/ggerganov/whisper.cpp`):

| id | label | ~size | notes |
|---|---|---|---|
| `small` | Small | ~466 MB | fast, lower fidelity |
| `medium` | Medium | ~1.5 GB | balanced |
| `large-v3-turbo` | Large v3 Turbo | ~1.6 GB | faster, slightly less faithful (optional) |
| `large-v3` | Large v3 (max fidelity) | ~3.1 GB | **default** — best pt-BR accuracy, slowest on CPU |

(`tiny`/`base` omitted from the UI — too low-fidelity for the "fidedigno" goal; trivial to add.)

VAD, decoding temperature, and context are **not** user options — they're fixed at the
anti-hallucination settings (rules 11–12), so a correct result never depends on the user knowing
to enable them.

The UI offers the model picker; if the chosen model isn't on disk it shows a **Download** step
(with progress) before transcription is enabled. The engine re-checks existence defensively
(rule 3).

---

## 5. Threading / Performance

- `async` commands; one ffmpeg pass + one whisper-cli pass per run. Single file at a time.
- **CPU default; GPU optional**: default `large-v3` + VAD. On CPU, `-t` = all cores + a forced
  language keep short clips reasonable (~20 s for 1 min). When the NVIDIA **CUDA** engine is
  installed (`download_gpu_engine`), `transcribe_audio` runs that exe from app-data instead —
  measured **≈7–10×** on 1–2 min clips (2 min: 112 s → 11 s; 1 min: 55 s → 7 s). No GPU = CPU
  fallback. The CUDA engine reports no granular `%` per chunk but is fast enough that the spinner +
  elapsed timer suffice; the CPU path keeps the streamed `%` bar. (AMD/Intel via Vulkan: future.)
- **Progress**: both download and recognition stream a `Channel`. Recognition passes
  whisper-cli `--print-progress` (it prints `progress = N%`), parsed (`parse_whisper_progress`)
  and forwarded as a percent; the UI shows an indeterminate state during model load, then a
  determinate bar.
- Models are loaded by whisper-cli per run (no resident process in v1).

---

## 6. UI States

A **Transcribe** mode in the **Audio** tab (alongside Convert · Trim · Volume · Speed).

```
Idle (drop zone)
  → Picked (file + model/lang/format controls)
      → [model missing] → Downloading(progress) → Picked
      → Working(busy)
          → Done(transcript preview + saved path)
          | Error(stderr tail)
```

- **Idle**: drop zone — "Drop an audio or video file here, or click to choose".
- **Picked**: file name; model picker showing each model's **size**. If the chosen model isn't
  installed, a clear **gate**: a one-line "This feature needs the *\<model\>* model (~3 GB) —
  download once to use it." + a **Download** button. Clicking shows a **progress bar with the
  model name + MB** (e.g. "Downloading large-v3 … 1.2 / 3.0 GB"); on completion the model is
  **installed automatically** (saved to app-data, persisted — never asked again) and the
  **Transcribe** button enables. Plus language (Auto default) and output format. The gate makes it
  visually obvious a one-time download is required.
- **Working**: a spinner (always moving) + a **real progress bar** from whisper-cli
  `--print-progress`; shows "Loading model…" (indeterminate) until the first percent, then a
  determinate bar.
- **Done**: scrollable transcript preview + **Copy** + `Saved: <path>`.
- **Error**: one line — `Failed: <stderr tail>` (or `Download failed: …`).

Shared visuals from `components/ui.tsx` (Card, dropzone, pill, Field). No conversion logic in
the component — it calls `lib/transcribe.ts`.

---

## 7. Edge Cases

| Scenario | Expected behavior |
|---|---|
| whisper-cli / ffmpeg sidecar missing | `Err` (sidecar not found) |
| Chosen model not downloaded | `Err("model not downloaded: <id>")` (no spawn); UI shows Download |
| Unknown model / task / format | `Err("unknown …")` (no spawn) |
| Corrupt / unreadable input | `Err` with the ffmpeg stderr tail (preprocess fails) |
| Silent / speechless audio | `Ok` with empty/near-empty transcript |
| Download interrupted (offline/cancel) | `.part` discarded; `Err("download failed: …")`; no partial model |
| Very long file | works (slower); v1 busy state, no per-segment progress |
| Output file already exists | overwritten (matches convert/audio-edit) |

---

## 8. Testing Checklist

- **Rust** (`cargo test`):
  - [ ] `model_url` / `model_filename` — known ids map to the HF URL + `ggml-<id>.bin`; unknown → `None`.
  - [ ] `output_path` — keeps the input dir, swaps to the format extension, per format.
  - [ ] `whisper_args` — builds `-m/-f/-l/-of/-o<fmt>`; **always emits VAD + greedy + max-context 0** (rules 11–12); `translate` adds `-tr`; `auto` vs forced language.
  - [ ] each `Err(String)` path: unknown model/task/format, model-not-downloaded.
  - [ ] `parse_whisper_progress` — `progress = N%` → `N`; a non-progress line → `None`.
- **Manual / runtime** (needs the sidecars + a downloaded model):
  - [ ] transcribe a pt-BR clip with `large-v3-turbo` → faithful `.txt` beside the input.
  - [ ] srt/vtt have sane timestamps; json parses.
  - [ ] `translate` on a non-English clip → English text.
  - [ ] model download shows progress; interrupting leaves no partial model.
  - [ ] error (corrupt file) surfaces in the UI.

---

## 9. Out of Scope (this version)

- **Translation into Portuguese / non-English targets** — Whisper's translate is English-only;
  faithful X→pt needs a separate MT engine (best fidelity = transcribe → dedicated MT/LLM).
  Note: the strong open MT (NLLB-200) is **CC-BY-NC** (non-commercial) — license-incompatible
  with Toolzy's MIT/commercial stance, so this is a deliberate, non-trivial follow-up.
- **Non-NVIDIA GPU** (AMD/Intel via Vulkan) — only the NVIDIA (CUDA) GPU engine is offered today;
  CPU serves everyone else. (NVIDIA GPU acceleration itself is **shipped** — §5.)
- **Live / streaming transcription** and microphone capture (file-based only).
- **Speaker diarization** ("who spoke when").
- **Batch transcription** across many files (one file per run, like audio-edit).
- **Live per-segment *text*** appearing as it transcribes — a **percentage** progress bar exists
  (whisper-cli `--print-progress`), but streaming the partial transcript text does not.
- **tiny/base models** in the UI (too low-fidelity for the goal; easy to enable later).
