# Toolzy Desktop (Tauri)

The desktop build wraps the same `apps/web` frontend and unlocks the desktop-only media
downloader (yt-dlp + ffmpeg run on the user's own machine and residential IP). See
[`docs/specs/media-download.md`](../../docs/specs/media-download.md) and
[ADR-002](../../docs/specs/architecture.md#adr-002-one-codebase-two-builds-web--tauri-desktop).

> This project is intentionally **outside the pnpm workspace** so the web app and CI never
> try to compile Rust. It is a scaffold: it needs the Rust toolchain, app icons, and the
> sidecar binaries before it will build.

## One-time setup

```bash
# 1. Rust toolchain + your OS Tauri prerequisites: https://tauri.app/start/prerequisites/

# 2. Install the Tauri CLI for this sub-project
cd apps/desktop
pnpm install

# 3. Generate app icons from a logo (creates src-tauri/icons/*)
pnpm tauri icon ../../assets/logo.png

# 4. Fetch the yt-dlp and ffmpeg sidecars into src-tauri/binaries/
node scripts/fetch-binaries.mjs
```

## Run / build

From the repo root:

```bash
pnpm desktop:dev     # runs Tauri against the web dev server (http://localhost:3000)
pnpm desktop:build   # produces an installer for the current OS
```

`tauri.conf.json` builds the web app first (`beforeBuildCommand`) and bundles
`apps/web/out`. Sidecars are declared in `tauri.conf.json` (`bundle.externalBin`) and invoked
from `src-tauri/src/lib.rs` (`download_media` command).
