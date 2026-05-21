# Sidecar binaries

Tauri bundles these as `externalBin` (see `tauri.conf.json`). They are **not committed**;
fetch them locally with `node ../../scripts/fetch-binaries.mjs` (from `apps/desktop`).

Tauri requires the target-triple suffix, e.g. on Windows x64:

```
yt-dlp-x86_64-pc-windows-msvc.exe
ffmpeg-x86_64-pc-windows-msvc.exe
```

and on Apple Silicon:

```
yt-dlp-aarch64-apple-darwin
ffmpeg-aarch64-apple-darwin
```

The fetch script downloads `yt-dlp` automatically and prints where to get `ffmpeg` for your
platform (its distribution is an archive, so it is a manual drop-in for now).
