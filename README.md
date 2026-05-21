# Toolzy

Free, open-source, privacy-first toolbox for everyday file tasks: convert images,
convert between PDF and images, resize and compress files, convert your own audio/video,
and (on the desktop build) download audio/video from a link.

**The core promise:** for browser tools, your files never leave your device. All
conversion runs locally — in the browser via WebAssembly, or natively in the desktop app.
No upload, no server, no account.

## What it does

Features ship in phases (see [`docs/ROADMAP.md`](docs/ROADMAP.md)). Status legend:
✅ done · 🚧 in progress · ⬜ planned.

| Feature | Status | Where it runs |
|---|---|---|
| Image convert (PNG ⇄ JPG ⇄ WebP ⇄ AVIF …) | ⬜ | Browser (WASM) |
| Image compress / resize | ⬜ | Browser (WASM) |
| PDF → image (per page) | ⬜ | Browser (WASM) |
| Image(s) → PDF | ⬜ | Browser (WASM) |
| Convert your own audio/video (MP4 → MP3 …) | ⬜ | Browser (`ffmpeg.wasm`) / native on desktop |
| Download audio/video from a link (MP4 / MP3) | ⬜ | **Desktop only** (`yt-dlp` + `ffmpeg`) |

### Why the downloader is desktop-only

Sites like YouTube block datacenter IPs ("Sign in to confirm you're not a bot"), so a
free public download server is not viable — and hosting one carries legal/ToS risk. The
desktop app sidesteps both: it runs `yt-dlp` on the **user's own machine and residential
IP**, so nothing is hosted by us, there is no server cost, and the user is responsible for
their own use. See [ADR-003](docs/specs/architecture.md#adr-003-the-downloader-is-desktop-only).

## Privacy

- Browser tools process files **100% client-side**. Files are never uploaded.
- No analytics that read file contents. No accounts. No tracking of what you convert.
- The desktop downloader talks directly from your machine to the source site — never
  through a Toolzy server (there isn't one).

## Architecture

One codebase, two builds: the same Next.js frontend is deployed as a static site **and**
wrapped by Tauri into a desktop app that unlocks the native-binary features.

```
toolzy/
├── apps/
│   ├── web/              # Next.js (static export) — the single frontend (web + desktop)
│   └── desktop/          # Tauri v2 (Rust) shell + bundled sidecars (yt-dlp, ffmpeg)
├── packages/
│   ├── engine/           # Framework-agnostic conversion engine (TS)
│   │   ├── image/        #   image codecs (Canvas, jSquash, wasm-vips)
│   │   ├── pdf/          #   pdf.js (read) + pdf-lib (write)
│   │   └── media/        #   ffmpeg.wasm (web) / native bridge (desktop)
│   ├── ui/               # Shared React components (shadcn/ui based)
│   └── config/           # Shared tsconfig / lint config
└── docs/
    ├── specs/            # Per-feature contracts + architecture decisions
    └── ROADMAP.md        # Done / doing / planned
```

Layering (Clean-Architecture spirit, adapted to TS/React):

- **`packages/engine`** — pure logic. No React, no DOM assumptions beyond Web APIs.
  Wraps every WASM/native library behind a project-owned `Converter` interface so the UI
  never imports a third-party codec directly.
- **`apps/web`** — presentation only. Components and hooks call the engine; the UI holds
  no conversion logic.
- **Web Workers** run the engine off the main thread so the UI never freezes.
- **Tauri sidecars** run native binaries (`yt-dlp`, `ffmpeg`) on the desktop build.

## Tech stack

| Concern | Tool |
|---|---|
| Framework | Next.js (App Router, `output: export` static) + React |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| Image codecs | Canvas API · `@jsquash/*` · `wasm-vips` |
| PDF | `pdfjs-dist` (read) · `pdf-lib` (write) |
| Media (web) | `@ffmpeg/ffmpeg` (ffmpeg.wasm) |
| Media (desktop) | native `ffmpeg` + `yt-dlp` via Tauri sidecar |
| Background work | Web Workers + Comlink |
| Desktop shell | Tauri v2 (Rust) |
| Error model | `Result<T, E>` discriminated union (no throwing across boundaries) |
| Global UI state | React hooks; Zustand only where cross-component state is real |
| i18n | `next-intl` (en default, pt-BR) |
| Monorepo | pnpm workspaces + Turborepo |
| Lint / format | Biome |
| Tests | Vitest (unit) · Playwright (e2e) |
| Web hosting | Cloudflare Pages (unlimited bandwidth, commercial-OK) |
| Desktop dist | GitHub Releases |
| CI | GitHub Actions |

See [`docs/specs/architecture.md`](docs/specs/architecture.md) for the rationale behind
each choice (ADRs).

## Spec-driven development

Every feature has a contract in [`docs/specs/`](docs/specs/) before code is written:
entities/types, numbered business rules, the engine contract, UI states, and edge cases.
Tests are written against the spec; code follows. Use [`docs/specs/_template.md`](docs/specs/_template.md)
for new features. Full conventions live in [`CLAUDE.md`](CLAUDE.md).

## Running locally

> Prerequisites: Node.js ≥ 20, pnpm ≥ 9. For the desktop build also: Rust toolchain and the
> Tauri prerequisites for your OS.

```bash
pnpm install
pnpm dev            # run the web app (apps/web) at http://localhost:3000
```

### Desktop app (Tauri)

```bash
pnpm desktop:dev    # run the desktop shell against the dev server
pnpm desktop:build  # produce a signed installer for the current OS
```

The desktop build bundles `yt-dlp` and `ffmpeg` as sidecars (see
[`docs/specs/architecture.md`](docs/specs/architecture.md#sidecars)).

## Testing

```bash
pnpm test           # Vitest unit tests (engine + UI)
pnpm test:e2e       # Playwright end-to-end
pnpm lint           # Biome lint
pnpm typecheck      # tsc --noEmit, strict
```

Tests follow F.I.R.S.T principles and mirror the source tree. The engine is the heavily
tested layer (deterministic, framework-free).

## Deploy

- **Web** → Cloudflare Pages. Two options:
  1. **Dashboard (recommended):** connect the GitHub repo in Cloudflare Pages with build
     command `pnpm build`, output directory `apps/web/out`, and `NODE_VERSION=20`.
  2. **Actions + wrangler:** add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets and
     a deploy job. CI (`.github/workflows/ci.yml`) already lints, typechecks, and builds on
     every push/PR. `COOP`/`COEP` ship via `public/_headers` for threaded WASM.
- **Desktop** → GitHub Releases. CI builds installers per OS and attaches them to the tag.

## Contributing

Open-source and contributions welcome. Read [`CLAUDE.md`](CLAUDE.md) and the relevant spec
in [`docs/specs/`](docs/specs/) before opening a PR. New feature? Write/extend the spec
first.

## License

App code: **MIT** (see `LICENSE`). Bundled binaries (`ffmpeg`, `yt-dlp`) keep their own
licenses and are invoked as **separate processes** (no linking), so they do not change the
app's license. Do not bundle AGPL libraries — see
[ADR-005](docs/specs/architecture.md#adr-005-library--license-choices).

## Legal note

Toolzy is a general-purpose tool. The desktop downloader runs entirely on the user's
machine; downloading content you do not have the right to download may violate a site's
Terms of Service or local law. Respecting those terms is the user's responsibility.
