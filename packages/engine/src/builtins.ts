import { imageConverter } from "./image";
import { type ConverterRegistry, registry } from "./registry";

/**
 * Populate a registry with the built-in 1:1 `Converter`s (the shared singleton by
 * default). Kept as an explicit call rather than an import-time side effect so
 * tree-shaking and per-test isolation stay predictable.
 *
 * Only true 1:1 conversions live here. PDF tools (1→N / N→1) and the media
 * runtime (bundler-coupled ffmpeg.wasm) are dedicated functions that return the
 * same `Result`, by design — see docs/specs/pdf-tools.md and media-convert.md.
 *
 * @example
 * registerBuiltins();
 * const image = registry.get("image");
 */
export function registerBuiltins(target: ConverterRegistry = registry): void {
  if (!target.has(imageConverter.id)) target.register(imageConverter);
}
