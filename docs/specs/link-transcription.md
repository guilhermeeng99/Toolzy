# Link Transcription Feature Spec

> **Status**: Implemented (local YouTube/link -> organized Markdown transcript)
> **Last updated**: 2026-07-18
> **Environment**: desktop (native)

Paste a YouTube/media URL, download only the best available audio with the existing `yt-dlp`
sidecar, transcribe locally with the existing Whisper pipeline, and save an organized Markdown
transcript to the user's Downloads folder. No hosted processing, no Toolzy server, no upload.

Speaker identification is intentionally out of scope. Real testing on interview-style YouTube audio
showed local diarization was not reliable enough for the product bar.

## 1. Supported Inputs / Outputs

Input: any `http(s)` URL supported by `yt-dlp`, with playlists disabled.

Temporary input: best audio stream (`ba/bestaudio/best`) downloaded into a per-run temp folder.
The audio is deleted after transcription.

Final output:

| Format | Location | Contents |
|---|---|---|
| Markdown `.md` | OS Downloads | source URL, language, timestamped context blocks |

Whisper intermediate output: JSON, written beside the temp audio and deleted after rendering the
Markdown. JSON is used because it exposes segment offsets and token timings when available.

## 2. Engine Contract

```rust
// link_transcription.rs
#[tauri::command]
async fn transcribe_link(
    app: AppHandle,
    url: String,
    model: String,
    language: Option<String>,
    on_download_progress: Channel<DownloadProgress>,
    on_transcribe_progress: Channel<TranscribeProgress>,
    state: State<TranscribeState>,
) -> Result<LinkTranscribeResult, String>;

struct LinkTranscribeResult {
    title: String,
    source_url: String,
    text: String,
    output_path: String,
    language: String,
    segment_count: usize,
}
```

Flow:

1. Validate `url` starts with `http://` or `https://`.
2. `yt-dlp --no-playlist -f ba/bestaudio/best` downloads to a temp dir and streams byte progress
   through `on_download_progress`.
3. Reuse `transcription::transcribe_path_to_base` with format `jsonFull`, so the existing ffmpeg
   preprocess, Whisper model checks, VAD, anti-hallucination flags, GPU engine, and Cancel state
   remain shared.
4. Parse word tokens from Whisper JSON when available; otherwise use segment offsets/text.
5. Group text into timestamped context blocks. Split on sentence boundaries, pauses over 2.5
   seconds, or long blocks.
6. Render Markdown to `Downloads/<title> - transcript.md`.
7. Delete the temporary audio, JSON, and temp directory.

## 3. Business Rules

1. Invalid / non-http URL returns `Err("Please paste a valid http(s) URL.")`.
2. Playlists are disabled. One link produces one transcript.
3. The chosen Whisper model must already be downloaded. The UI uses the existing model gate.
4. The spoken language defaults to Whisper auto-detection. The user can still force a language
   when they know it and want to reduce ambiguity.
5. Transcription always uses the existing anti-hallucination settings from
   [transcription](transcription.md): Silero VAD, greedy temperature 0, no fallback, max-context 0.
6. The saved file is Markdown only in this version. Raw JSON is an intermediate, not final UX.
7. Speaker labels, speaker counting, and speaker names are not shown or inferred.
8. Temporary audio is removed after the command completes; a failed download may leave no final
   transcript.
9. Every `yt-dlp` invocation passes `--encoding utf-8`. On Windows yt-dlp otherwise writes its
   `--print` output in the console codepage (cp1252), which is not valid UTF-8, so an accented
   title (`Reunião orientação`) reaches Rust as U+FFFD and the reported audio path no longer
   resolves — ffmpeg then fails on a file that does not exist.
10. The audio path reported by yt-dlp is used only when it resolves to an existing file. Otherwise
    the per-run temp dir is scanned for its single file, so a corrupted or missing path line never
    reaches ffmpeg as a non-existent input.
11. Whisper tokens are **subwords**, and the word boundary is encoded as a leading space
    (`" ent"` + `"rando"` is one word). Each segment carries `starts_word`, read before the text
    is trimmed; a continuation is concatenated with no separator and never starts a new block.
    Joining every token with a space instead shredded real words into `Obrig ado` / `out ub ro`.
12. A token whose `offsets.from == offsets.to` is kept, not dropped. Zero duration means Whisper
    could not resolve the timing, not that the token is junk — discarding those silently deleted
    real words and punctuation from the transcript (the `Gu` of `Guilherme`, `" aí"`, `","`).
    Bracketed special tokens (`[_BEG_]`, `[_TT_n]`) are still filtered out by text, not by timing.

## 4. UI

The Download tab has two modes:

- **Download**: existing MP4/MP3 quality picker.
- **Transcribe link**: URL, Whisper model, language (`Auto-detect` by default), optional GPU prompt,
  Whisper model download gate, two-phase progress (audio download -> transcription), preview, Copy,
  saved path.

## 5. Diarization Decision

Whisper itself does not identify speakers. `whisper.cpp` tinydiarize, pyannote Community-1, and
NVIDIA Sortformer v2.1 were evaluated for this workflow. In local desktop use, the tested
interview video still produced misleading speaker boundaries, especially where a question and
answer were close together.

Toolzy should not present unreliable speaker labels as if they are trustworthy. The shipped feature
therefore focuses on the reliable part: local transcription with clear timestamps and context
blocks.

## 6. Testing Checklist

- **Rust** (`cargo test`):
  - [ ] `build_audio_download_args` requests best audio, safe filenames, progress, and final path.
  - [ ] `build_audio_download_args` forces `--encoding utf-8` (accented titles stay round-trippable).
  - [ ] `only_file_in` resolves the temp dir's single file and stays `None` when ambiguous.
  - [ ] `parse_segments` reads Whisper JSON offsets/text.
  - [ ] `parse_segments` prefers Whisper tokens when available.
  - [ ] Subword tokens rejoin into whole words (`" ent"` + `"rando"` → `entrando`).
  - [ ] A continuation token never starts a block, even across a long pause.
  - [ ] Zero-duration tokens keep their text; bracketed special tokens are still dropped.
  - [ ] `group_segments` splits on long pauses.
  - [ ] `render_markdown` includes title, source, language, and timestamp blocks.
  - [ ] `render_markdown` never includes speaker labels.
  - [ ] `timestamp` renders `MM:SS` and `HH:MM:SS`.
- **Manual / runtime**:
  - [ ] Paste a YouTube URL, use an installed model, and confirm a `.md` is saved to Downloads.
  - [ ] Use a URL whose title has accents/non-ASCII characters and confirm it transcribes.
  - [ ] Confirm the UI does not ask for speaker count, speaker labels, or any extra model/token.
  - [ ] Confirm the saved Markdown has timestamped blocks and no speaker headers.
  - [ ] Interrupt / fail a URL and confirm the UI surfaces the yt-dlp error.
  - [ ] Confirm no temp audio remains after a successful run.

## 7. Out of Scope

- Speaker identification, speaker counting, and renameable speakers.
- Playlists and batch link transcription.
- Export formats beyond Markdown.
- Cookie/login support.
