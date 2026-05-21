# Architecture & Decision Records

> **Status**: Living document
> **Last updated**: 2026-05-21
> Cross-cutting design + the rationale (ADRs) behind the big choices. Feature-level contracts
> live in sibling files (`image-conversion.md`, etc.); start new ones from `_template.md`.

## 1. System shape

Toolzy is a **client-side application with no backend**. The same frontend ships twice:

```
            ┌────────────────────────────┐
            │      apps/web (Next.js)     │  ← single frontend codebase
            │  React UI · registry-driven │
            └─────────────┬──────────────┘
                          │ calls
            ┌─────────────▼──────────────┐
            │   packages/engine (TS)      │  ← Converter interface + registry
            └───┬───────────────────┬────┘
   browser env  │                   │  desktop env
   ┌────────────▼─────┐   ┌─────────▼───────────────┐
   │ Web Worker        │   │ Tauri sidecar (Rust IPC) │
   │ WASM codecs:      │   │ native binaries:         │
   │ Canvas/jSquash/   │   │ ffmpeg, yt-dlp           │
   │ wasm-vips/pdfjs/  │   │                          │
   │ pdf-lib/ffmpeg.wasm│  │                          │
   └───────────────────┘   └──────────────────────────┘
```

- **Web build**: static export, deployed to Cloudflare Pages. Every tool that can run in the
  browser does, inside a Web Worker via WASM.
- **Desktop build**: Tauri wraps the identical web UI and unlocks `environment: 'desktop'`
  converters that shell out to native binaries.

The registry (`packages/engine`) is the seam: the UI renders whatever converters are
registered and permitted in the current environment. No forked UIs.

---

## ADRs

### ADR-001: Client-side first
**Status:** Accepted · 2026-05-21

**Context.** Image/PDF/media conversion can run in the browser via WebAssembly
(Canvas, jSquash, wasm-vips, pdf.js, pdf-lib, ffmpeg.wasm). The alternative is uploading
files to a server that runs sharp/ImageMagick/ffmpeg.

**Decision.** Do all convertible work **in the browser**. No upload, no server.

**Consequences.**
- ✅ Zero per-conversion cost; scales infinitely; strong privacy (files never leave device);
  no upload latency.
- ✅ Hosting is just static assets → fits Cloudflare Pages' free, unlimited-bandwidth tier.
- ⚠️ Bounded by browser memory; very large files may struggle (mitigate: size caps, chunking,
  desktop fallback).
- ⚠️ Ships WASM payloads → must lazy-load codecs per tool.

### ADR-002: One codebase, two builds (web + Tauri desktop)
**Status:** Accepted · 2026-05-21

**Context.** Some features (the downloader) cannot run in a browser. Maintaining two
separate apps would duplicate UI.

**Decision.** Single Next.js frontend. Web deploy = static site. Desktop = **Tauri v2**
wrapping the same frontend, adding native-binary features behind a runtime capability check.

**Consequences.**
- ✅ ~95% code reuse; one UI to maintain.
- ✅ Tauri uses the OS webview → small installers (~MBs, vs ~150 MB Electron).
- ✅ Desktop can use **native** ffmpeg (fast) instead of ffmpeg.wasm.
- ⚠️ Adds a Rust toolchain + per-OS build matrix in CI.
- ⚠️ Feature code must stay environment-aware (no desktop-only imports leaking into web).

### ADR-003: The downloader is desktop-only
**Status:** Accepted · 2026-05-21

**Context.** Downloading from sites like YouTube needs `yt-dlp` (browser can't, due to CORS
+ signature deciphering). Hosting `yt-dlp` on a server fails in practice: YouTube blocks
datacenter IPs ("Sign in to confirm you're not a bot"), requiring paid residential proxies
or cookies, and a public hosted downloader carries ToS/legal risk.

**Decision.** Ship the downloader **only in the desktop app**, where `yt-dlp` runs on the
**user's own machine and residential IP**. Toolzy hosts nothing for it.

**Consequences.**
- ✅ No server, no proxy cost, no IP-block problem.
- ✅ Legal exposure shifts appropriately to the end user; we host no infringing pipeline.
- ✅ Native ffmpeg available for muxing/MP3 extraction.
- ⚠️ Users must install the desktop app for this feature; the web build shows a "get the app"
  placeholder on that route.
- ⚠️ `yt-dlp` breaks often → bundle it as an auto-updatable sidecar binary, decoupled from
  releases.

**Rejected alternative:** "public site calls the user's `localhost` backend." Blocked by
mixed-content (HTTPS→HTTP) + CORS, and still requires the user to run a separate process.
The all-in-one Tauri app is strictly better UX.

### ADR-004: Cloudflare Pages for web hosting
**Status:** Accepted · 2026-05-21

**Context.** The site is static but serves heavy WASM payloads to potentially viral, free
traffic. Bandwidth is the only real cost driver.

**Decision.** Host the web build on **Cloudflare Pages**.

**Consequences.**
- ✅ **Unlimited bandwidth** on the free tier — decisive for multi-MB WASM at scale.
- ✅ Commercial use allowed on free tier (donations/ads later won't violate ToS).
- ✅ No overage bills; global CDN.
- vs Vercel: Vercel's Hobby tier caps bandwidth at 100 GB/mo and forbids commercial use; its
  Next.js server features are irrelevant to a static export. Vercel would only win for an
  SSR/ISR-heavy app, which Toolzy is not.

### ADR-005: Library & license choices
**Status:** Accepted · 2026-05-21

**Decision.** App code is **MIT**. Choose permissively licensed libraries; **never bundle
AGPL**. Native binaries are invoked as separate processes (sidecars), not linked.

| Need | Library | License | Note |
|---|---|---|---|
| Image (simple) | Canvas API | — | Built-in; png/jpg/webp |
| Image (modern/compress) | `@jsquash/*` | permissive (Apache/BSD mix) | AVIF/JPEG-XL, Squoosh lineage |
| Image (broad formats) | `wasm-vips` | LGPL | OK as unmodified WASM module |
| PDF read/render | `pdfjs-dist` | Apache-2.0 | ✅ |
| PDF write | `pdf-lib` | MIT | ✅ |
| ~~PDF (MuPDF.js)~~ | — | **AGPL** | ❌ viral — would force the whole app AGPL. Excluded. |
| Media | `ffmpeg` | LGPL/GPL build | Sidecar (desktop) / `ffmpeg.wasm` (web). Separate process → no linking. |
| Download | `yt-dlp` | Unlicense | ✅ public domain; bundled sidecar |

### ADR-006: Result-based error model
**Status:** Accepted · 2026-05-21

**Decision.** Cross-boundary code returns `Result<T, ToolzyError>` (discriminated union);
no throwing for expected failures. `ToolzyError` is a sealed union extended centrally.

**Consequences.**
- ✅ Exhaustive handling at the UI (switch on `error.kind`), localized messages.
- ✅ Mirrors the discipline used elsewhere; predictable failure surface for tests.
- ⚠️ Slightly more verbose than throwing; worth it at module boundaries.

---

## Cross-cutting concerns

### Threading
Browser conversions run in a **Web Worker** (Comlink-wrapped) so the main thread never
blocks. The engine is worker-agnostic; the worker is an adapter the UI injects.

### Sidecars
Desktop native features are Tauri **sidecars** — `yt-dlp` and `ffmpeg` shipped as separate
executables, invoked via Tauri's shell/command API. Benefits: clean licensing (no linking),
independent updates (especially `yt-dlp`), and stderr captured into
`{ kind: 'sidecar_failed' }`.

### Lazy WASM loading
A codec's `.wasm` is fetched on first use of its tool, never at page load. `ffmpeg.wasm`
(~30 MB) is the strictest case. Keeps first paint fast and avoids paying for unused payloads.

### COOP/COEP headers
Threaded WASM (`SharedArrayBuffer`, used by ffmpeg.wasm and others) requires
`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`.
Set via `apps/web/public/_headers` on Cloudflare Pages. Verify before relying on threads.

### Privacy
No content-inspecting telemetry; no upload path for browser tools; the desktop downloader
never routes through a Toolzy server. Enforce per-converter size caps before decoding.
