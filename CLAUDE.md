# Toolzy — Project Conventions

Free, open-source, privacy-first file toolbox (image/PDF/media conversion + a desktop-only
media downloader). Web build runs every tool client-side via WebAssembly; the desktop build
(Tauri) adds native-binary features. See [`README.md`](README.md) for the overview and
[`docs/specs/architecture.md`](docs/specs/architecture.md) for the decision records.

---

## Core Principles

1. **Privacy is a feature, not a footnote.** Browser tools process files 100% client-side.
   Never add an upload path for a tool that can run in the browser.
2. **Client-side by default; server never.** Toolzy has **no backend**. If something can't
   run in the browser, it runs in the desktop app (native binary), not on a server we host.
   See [ADR-001](docs/specs/architecture.md#adr-001-client-side-first) /
   [ADR-003](docs/specs/architecture.md#adr-003-the-downloader-is-desktop-only).
3. **One codebase, two builds.** The same `apps/web` frontend is the web site and the Tauri
   desktop UI. Feature code must work on web; desktop-only capabilities are gated behind a
   runtime capability check, never a forked UI.
4. **The engine is framework-free.** All conversion logic lives in `packages/engine` as
   plain TypeScript. The UI orchestrates; the engine executes.

---

## Architecture

Monorepo (pnpm workspaces + Turborepo):

```
apps/
  web/        # Next.js (App Router, output: export). Presentation only.
  desktop/    # Tauri v2 (Rust) shell + sidecars (yt-dlp, ffmpeg).
packages/
  engine/     # Conversion engine (TS): image/ pdf/ media/. No React, no DOM-only deps.
  config/     # Shared tsconfig + Biome config.
              # UI primitives live in apps/web/components/ui for now; a shared
              # packages/ui is planned only if a second app needs them.
docs/
  specs/      # Per-feature contracts + architecture.md (ADRs).
  ROADMAP.md  # Done / doing / planned.
```

Layer rules (Clean-Architecture spirit):

- `engine` depends on nothing in `apps/`.
- `apps/web` depends on `engine`, never the reverse.
- Codecs sit behind the engine's types/`Result`. Pure logic (Canvas image pipeline, ffmpeg
  arg-building, page-size/filename math) lives in `engine`. Codecs that are
  bundler/asset-coupled (`pdfjs-dist`, `pdf-lib`, `@ffmpeg/*`; later `@jsquash/*`,
  `wasm-vips`) run in thin wrappers under `apps/web/lib/{pdf,media}`, still returning
  `Result`. UI **components** never import a codec directly — they call the engine or a
  `lib/` wrapper.

---

## The Engine & Converter Registry

The engine is the seam between UI and codecs. **True 1:1 conversions** implement the
`Converter` interface and register in the `ConverterRegistry` (via `registerBuiltins`); the
registry is the catalog used for discovery and environment gating. **Non-1:1 tools** — PDF
(1→N / N→1) and the bundler-coupled media runtime — are dedicated functions that return the
same `Result`, not registry entries (see [`pdf-tools.md`](docs/specs/pdf-tools.md),
[`media-convert.md`](docs/specs/media-convert.md)).

- Adding a **1:1** tool = implement `Converter` + add it to `registerBuiltins`.
- Adding a **1→N / N→1 or runtime-coupled** tool = a dedicated `Result`-returning function.

```ts
// packages/engine/src/types.ts
export type ToolzyError =
  | { kind: 'unsupported_format'; from: string; to: string }
  | { kind: 'file_too_large'; size: number; max: number }
  | { kind: 'decode_failed'; format: string; cause?: string }
  | { kind: 'encode_failed'; format: string; cause?: string }
  | { kind: 'worker_failed'; cause?: string }
  | { kind: 'sidecar_failed'; tool: string; code?: number; stderr?: string } // desktop
  | { kind: 'canceled' };

export type Result<T, E = ToolzyError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface ConversionOutput {
  blob: Blob;
  format: string;
  filename: string;
  bytes: number;
}

export interface ConvertContext {
  signal?: AbortSignal;              // cancellation
  onProgress?: (ratio: number) => void; // 0..1
}

export interface Converter<O = Record<string, unknown>> {
  id: string;                        // 'image' | 'pdf-to-image' | 'media-download' | ...
  inputs: readonly string[];         // accepted source formats / mime types
  outputs: readonly string[];        // producible target formats
  environment: 'browser' | 'desktop' | 'both';
  convert(
    file: File | Blob,
    target: string,
    options: O,
    ctx?: ConvertContext,
  ): Promise<Result<ConversionOutput>>;
}
```

Rules:

- Converters **return** `Result`; they never throw across the boundary. Map every internal
  exception to a `ToolzyError`.
- `environment: 'desktop'` features must not be reachable in the web build — gate them by the
  runtime capability check (`isDesktop()`) and/or the registry's environment filter, not by
  hiding a button.
- Long work runs in a Web Worker (browser) or a sidecar (desktop). `convert` is `async` and
  honors `ctx.signal`.

---

## Error Model

- Cross-boundary functions (engine, IO, worker/sidecar bridges) return `Result<T, E>`.
  No `throw` for expected failures. Mirrors a sealed error union — extend `ToolzyError`
  rather than inventing ad-hoc error shapes.
- UI maps each `error.kind` to a localized message. Never surface a raw exception string.

---

## Code Style

- Functions: **5–25 lines**. Split if longer.
- Files: ideally under **400–600 lines**.
- One responsibility per function/module (SRP).
- Prefer small, composable components and pure helpers over large ones.

### Naming

- Specific and intention-revealing. Avoid generic `data`, `manager`, `handler`, `utils`.
- Names should be searchable and unique within the codebase.

### Control Flow

- Prefer early returns over nested conditionals.
- Max **2 levels** of indentation.

---

## Comments

- Write **WHY**, not WHAT.
- Preserve context and decisions; don't strip meaningful comments during refactors.
- Exported APIs document intent, params, and a short usage example.

---

## Key Technologies

| Aspect | Detail |
|---|---|
| Framework | Next.js App Router, `output: export` (fully static) + React |
| Language | TypeScript, `strict: true` |
| Styling | Tailwind CSS + shadcn/ui |
| Image | Canvas API (png/jpg/webp) → `@jsquash/*` (avif/jxl + compression) → `wasm-vips` (broad formats) |
| PDF | `pdfjs-dist` (read/render) + `pdf-lib` (write). **No MuPDF** (AGPL) |
| Media (web) | `@ffmpeg/ffmpeg` (ffmpeg.wasm) — user's own files only |
| Media (desktop) | native `ffmpeg` + `yt-dlp` via Tauri sidecar |
| Threading | Web Workers + Comlink |
| Desktop | Tauri v2 (Rust) |
| State | React hooks; Zustand only for genuinely cross-component state |
| i18n | `next-intl` (en + pt-BR) — _planned; UI is English-only today_ |
| Lint/format | Biome |
| Tests | Vitest (unit, active) · Playwright (e2e, _planned_) |

---

## Commands

```bash
pnpm install          # install workspace deps
pnpm dev              # web app dev server (apps/web)
pnpm build            # static export of the web app
pnpm desktop:dev      # Tauri desktop in dev
pnpm desktop:build    # Tauri installer for current OS
pnpm test             # Vitest unit tests (engine + framework-free app helpers)
pnpm lint             # Biome
pnpm typecheck        # tsc --noEmit (strict)
# pnpm test:e2e       # Playwright e2e — planned, not wired yet
```

> RTK: prefix dev commands with `rtk` for token-optimized output (e.g. `rtk pnpm install`,
> `rtk vitest`, `rtk next build`, `rtk git status`). Run `rtk init` to embed the full RTK
> reference in this file.

---

## Post-Change Checklist

After every code change:

1. `pnpm typecheck` — zero errors (strict).
2. `pnpm lint` — zero errors.
3. `pnpm test` — all unit tests pass.
4. New engine logic → has unit tests. Bug fix → has a regression test.
5. Touched a feature's behavior? Update its spec in `docs/specs/` in the same PR.
6. Touched scope (shipped/started/finished a roadmap item)? Update `docs/ROADMAP.md`.

---

## Spec-Driven Development

Every feature MUST have a spec at `docs/specs/<feature>.md` before new code or tests.

### Workflow

1. Write or update the spec (formats, business rules, engine contract, UI states, edge cases).
2. Write tests based on the spec.
3. Implement to pass the tests.
4. Update the spec if requirements change — spec and code never drift.

### Spec Structure

Use [`docs/specs/_template.md`](docs/specs/_template.md). Sections: Overview + scope
decisions, Supported formats, Engine contract, Business rules (numbered, testable),
Options, Threading/perf, UI states, Edge cases, Testing checklist, Out of scope.

---

## Testing Rules

- Every engine converter has unit tests for: each format pair, options, cancellation, and
  each `ToolzyError` it can produce.
- Every bug fix includes a regression test.
- F.I.R.S.T: Fast, Independent, Repeatable, Self-validating, Timely.
- One test file per source file, mirroring the tree.
- Use fixtures/factories for test files (tiny sample images/PDFs) — never giant binaries in
  the repo.
- Mock at boundaries: stub the worker/sidecar bridge when testing UI; test the engine
  against real WASM where feasible (it's deterministic).

---

## Dependencies

- Depend on abstractions, not implementations. Every codec sits behind the engine's
  types/`Result` — a `Converter` for 1:1 tools, a dedicated function otherwise.
- Inject dependencies (worker factory, sidecar bridge) rather than importing singletons,
  so tests can substitute them.
- Adding a heavy WASM dep is a deliberate decision — record it in `architecture.md`.

---

## Performance

- Heavy work off the main thread (Web Worker). The UI never blocks.
- **Lazy-load WASM**: a codec's `.wasm` is fetched only when its tool is used, not on page
  load. `ffmpeg.wasm` (~30 MB) especially must be on-demand.
- Stream/process large files in chunks where the API allows; release `Blob`/`ObjectURL`
  references promptly.
- Lists of files use virtualized/lazy rendering.

---

## Desktop / Tauri

- Native features (`yt-dlp`, `ffmpeg`) ship as **sidecars** (separate binaries invoked as
  child processes), never linked into the app — keeps the MIT license clean.
- Desktop-only features are gated by `isDesktop()`; the web build must compile and run
  without them. (Desktop converters may also declare `environment: 'desktop'`.)
- Sidecar failures: the engine reserves `{ kind: 'sidecar_failed', ... }` for converters that
  return `Result`. The current `download_media` IPC returns a curated message string (stderr
  tail) instead — fold it into `sidecar_failed` when the downloader moves behind the engine.

---

## Privacy & Security

- No telemetry that inspects file contents. No file uploads for browser tools.
- The desktop downloader connects directly from the user's machine to the source; no
  Toolzy server is ever in the path.
- Validate file size against a per-converter `max` before decoding to avoid OOM; surface
  `{ kind: 'file_too_large' }`.

---

## Out of Scope (project-wide, for now)

- Any hosted/server-side processing or a public download API (see ADR-001/003).
- User accounts, cloud storage, sync.
- Paid tiers. Funding, if any, is donation-only and must not gate features.
