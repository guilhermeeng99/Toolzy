# <Feature> Feature Spec

> **Status**: Draft | In progress | Implemented (shipped)
> **Last updated**: YYYY-MM-DD
> **Coverage**: which sections below are filled in
> **Environment**: browser | desktop | both

One-paragraph description: what the feature does and who it's for.

**Scope decisions** (locked at design time — list the deliberate boundaries):

- **<decision>**: <what and why>.
- **<decision>**: <what and why>.

---

## 1. Supported Formats / Inputs

State exactly what goes in and what comes out. A matrix is ideal.

| From → To | <fmt> | <fmt> | <fmt> |
|---|---|---|---|
| <fmt> | ✅ | ✅ | — |

Note the engine (Canvas / jSquash / wasm-vips / pdfjs / pdf-lib / ffmpeg / yt-dlp) backing
each path, and any size caps.

---

## 2. Engine Contract (Rust command)

How this feature is implemented as a `#[tauri::command]` in `app/src-tauri` (see `CLAUDE.md`
→ Engine). Commands return `Result<T, String>`. Pure helpers go in a module with `cargo test`.

```rust
#[tauri::command]
fn foo(path: String, target: String, options: Option<FooOpts>) -> Result<FooResult, String>;
// async fn + AppHandle when shelling out to a sidecar (ffmpeg / yt-dlp)
```

- `FooOpts` / `FooResult` shape (serde `rename_all = "camelCase"`); each field: type, default.
- Which `Err(String)` messages it returns, and when.
- Native lib (compiled-in crate) vs sidecar vs runtime-loaded library; any required binary.
- The UI wrapper in `app/src/lib/*.ts` (`invoke<T>("foo", …)`).

---

## 3. Business Rules

Numbered, testable, unambiguous. Each becomes one or more tests.

1. **<rule>** — <precise behavior, including the failure case>.
2. ...

---

## 4. Options & Defaults

Every user-facing parameter: name, type, range, default, and effect. Note validation
(what the UI disables vs. what the engine re-checks defensively).

---

## 5. Threading / Performance

- Worker vs sidecar; what is lazy-loaded and when.
- Memory/size limits and how they're enforced (`file_too_large`).
- Progress + cancellation behavior.

---

## 6. UI States

The screen's state machine and layout.

```
States: Idle → Picking → Converting(progress) → Done(result) | Error(ToolzyError)
Transitions: ...
```

- Empty state / drop zone.
- In-progress (progress, cancel).
- Result (preview, before/after size, download / download-all ZIP).
- Error (per `error.kind`, localized).

---

## 7. Edge Cases

| Scenario | Expected behavior |
|---|---|
| Unsupported source / target | `Err("unsupported …")`, friendly message |
| Corrupt input | `Err("decode failed: …")` |
| Missing sidecar / runtime lib | `Err` (binary not found) |
| One file fails in a batch | that row errors; the rest continue |

---

## 8. Testing Checklist

- **Rust** (`cargo test`):
  - [ ] pure helpers (dimensions / filename / arg building) at their boundaries
  - [ ] each `Err(String)` path the command can return
- **Manual / runtime** (needs the native binaries):
  - [ ] happy path per format
  - [ ] error message surfaces in the UI
  - [ ] batch (if applicable)

---

## 9. Out of Scope (this version)

- <deferred item> — <why deferred / where it lives later>.
