# Media Convert Feature Spec

> **Status**: Draft (Phase 3)
> **Last updated**: 2026-05-21
> **Coverage**: Formats, Engine API, Business rules, UI, Edge cases, Testing
> **Environment**: browser (web). The desktop build will route the same UI to native ffmpeg.

Convert the user's **own** audio/video files to audio formats, entirely in the browser, via
`ffmpeg.wasm`. The headline case is **MP4 to MP3** (extract audio). This is distinct from the
Phase 4 downloader, which fetches media from a link and is desktop-only.

**Scope decisions** (locked):

- **Client-side only** (ADR-001), using the **single-thread** `@ffmpeg/core` so it works
  without cross-origin isolation (no COEP needed in dev). Slower than multi-thread, but
  robust and simple.
- **Audio targets only in V1**: `mp3`, `m4a`, `wav`. Video transcoding (mp4 to webm, etc.)
  is heavy in WASM and deferred.
- **Lazy load**: the ~30 MB core is fetched only when the tool runs, never on page load.
- **One file at a time** in V1 (ffmpeg is memory-bound). Progress comes from ffmpeg events.
- The pure parts (argument building, output naming) live in the engine and are unit-tested;
  the ffmpeg runtime wrapper lives in `apps/web/lib/media` (bundler/asset-coupled).

---

## 1. Formats

In: any `audio/*` or `video/*` the core can demux (mp4, mov, webm, mkv, avi, mp3, wav, ...).
Out: `mp3` (libmp3lame), `m4a` (native aac), `wav` (pcm_s16le).

Size cap: `MAX_MEDIA_BYTES = 500 MB` (checked before load). WASM memory still bounds very
large files; surfaced as an error if ffmpeg runs out.

---

## 2. Engine API + runtime

Pure, in `packages/engine/src/media`:

```ts
export const AUDIO_TARGETS = ["mp3", "m4a", "wav"] as const;
export type AudioTarget = (typeof AUDIO_TARGETS)[number];

export function buildAudioArgs(input: string, output: string, target: AudioTarget): string[];
export function audioOutputName(inputName: string, target: AudioTarget): string;
```

Runtime, in `apps/web/lib/media/ffmpeg.ts`:

```ts
export function convertAudio(
  file: File,
  target: AudioTarget,
  ctx?: ConvertContext, // onProgress 0..1
): Promise<Result<ConversionOutput>>;
```

- Loads a lazily-created singleton `FFmpeg` with core/wasm served from `/ffmpeg/*`
  (copied from `@ffmpeg/core` at build by `scripts/copy-ffmpeg.mjs`).
- Maps ffmpeg's `progress` event to `ctx.onProgress`; ffmpeg failures map to `encode_failed`.

---

## 3. Business Rules

1. **`-vn`** drops any video stream; output is audio only.
2. **Output name** = input base name + new extension (`clip.mp4` to `clip.mp3`).
3. **Codecs**: mp3 = `libmp3lame -q:a 2`; m4a = native `aac -b:a 192k`; wav = `pcm_s16le`.
4. **Size cap** enforced before loading ffmpeg; over cap returns `file_too_large`.
5. **One conversion at a time**; the UI disables the button while running.
6. **Core is loaded once** and reused across conversions in the session.

---

## 4. UI (`/tools/media`)

- Drop one audio/video file.
- Choose target (mp3 / m4a / wav).
- Convert with a progress bar (real ffmpeg progress) and the "stays on your device" note.
- Download the result. A first run shows a brief "loading converter (~30 MB, one time)" hint.

---

## 5. Edge Cases

| Scenario | Expected |
|---|---|
| File over 500 MB | `file_too_large`, no load |
| Unsupported/corrupt media | `encode_failed` with ffmpeg detail |
| Target codec missing in core | `encode_failed` (graceful) |
| Very large file exhausts WASM memory | `encode_failed`; suggest the desktop app |
| Core fetch fails (offline first run) | `worker_failed`/`encode_failed`; retry later |

---

## 6. Testing Checklist

- **Engine** (unit): `buildAudioArgs` for each target; `audioOutputName` extension swap and
  fallback.
- **UI** (manual / Playwright later): mp4 to mp3 happy path; progress; download.

---

## 7. Out of Scope (V1)

- Video transcoding (mp4 to webm/gif, resize, trim) — later, and faster on desktop.
- Batch conversion.
- Multi-thread core (would require COEP cross-origin isolation in dev).
- Bitrate/sample-rate controls (sensible defaults only).
