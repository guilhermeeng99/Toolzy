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

## 2. Engine Contract

How this feature plugs into the engine (see `CLAUDE.md` → Engine). **1:1 conversions**
implement `Converter` and register via `registerBuiltins`; **1→N / N→1 or runtime-coupled**
tools are dedicated `Result`-returning functions (see `pdf-tools.md` / `media-convert.md`).
Show the shape either way.

```ts
const fooConverter: Converter<FooOptions> = {
  id: '...',
  inputs: [...],
  outputs: [...],
  environment: 'browser' | 'desktop' | 'both',
  convert(file, target, options, ctx) { /* returns Result<ConversionOutput> */ },
};
```

- `FooOptions` shape (each field: type, default, constraints).
- Which `ToolzyError` kinds this converter can return, and when.
- Where it runs (Worker / sidecar) and how `ctx.signal` / `ctx.onProgress` are honored.

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
| Unsupported source format | `unsupported_format`, friendly message |
| File over size cap | `file_too_large`, no decode attempted |
| User cancels mid-conversion | `canceled`, partial output discarded |
| Corrupt input | `decode_failed` |
| ... | ... |

---

## 8. Testing Checklist

- **Engine** (Vitest, real WASM where feasible):
  - [ ] every format pair in the matrix
  - [ ] each option boundary
  - [ ] cancellation
  - [ ] each `ToolzyError` kind
- **UI** (Vitest + Playwright):
  - [ ] happy path end-to-end
  - [ ] error rendering per kind
  - [ ] batch / ZIP (if applicable)

---

## 9. Out of Scope (this version)

- <deferred item> — <why deferred / where it lives later>.
