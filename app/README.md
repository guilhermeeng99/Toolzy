# Toolzy (desktop-native)

The native desktop app: **Tauri 2 (Rust) · React + TypeScript + Vite · Tailwind v4 · pnpm**.
Rust is the engine (conversion runs natively); the React UI is a thin webview front-end.

> Status: **PoC** — native image converter (png/jpg + resize/quality). PDF, media, and the
> downloader land next (see [`../docs/ROADMAP.md`](../docs/ROADMAP.md) → "desktop-native pivot").

## Layout

```
app/
  src/            # React + TS UI (thin): components call invoke()
  src-tauri/      # Rust = engine
    src/lib.rs            # commands (convert_image)
    src/image_convert.rs  # pure logic + cargo tests
```

## Develop

This app is standalone (not part of the repo's pnpm workspace), so install with
`--ignore-workspace`:

```bash
pnpm install --ignore-workspace   # run inside app/
pnpm tauri dev                    # run the desktop app (Vite + Tauri)
```

Other useful commands:

```bash
pnpm dev          # Vite dev server only (UI in a browser; invoke() needs the app)
pnpm build        # tsc --noEmit + vite build → dist/
pnpm tauri build  # produce an installer for the current OS
cargo test --manifest-path src-tauri/Cargo.toml   # Rust unit tests
```

Icons in `src-tauri/icons/` are generated (`pnpm tauri icon <png>`); the current set is a
placeholder logo. Replace before release.
