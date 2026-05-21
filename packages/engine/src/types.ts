/**
 * Core engine types. Every conversion tool implements `Converter` and returns
 * a `Result` instead of throwing across the boundary (see docs ADR-006).
 */

/** Sealed error union. Extend here, never invent ad-hoc error shapes. */
export type ToolzyError =
  | { kind: "unsupported_format"; from: string; to: string }
  | { kind: "file_too_large"; size: number; max: number }
  | { kind: "decode_failed"; format: string; cause?: string }
  | { kind: "encode_failed"; format: string; cause?: string }
  | { kind: "worker_failed"; cause?: string }
  | { kind: "sidecar_failed"; tool: string; code?: number; stderr?: string }
  | { kind: "canceled" };

export type Result<T, E = ToolzyError> = { ok: true; value: T } | { ok: false; error: E };

export type Environment = "browser" | "desktop" | "both";

export interface ConversionOutput {
  blob: Blob;
  /** Target format key, e.g. "jpg". */
  format: string;
  filename: string;
  bytes: number;
}

export interface ConvertContext {
  /** Abort the work; converters should resolve to `{ kind: "canceled" }`. */
  signal?: AbortSignal;
  /** Progress in the range 0..1. */
  onProgress?: (ratio: number) => void;
}

/**
 * A single conversion capability. Registered in the `ConverterRegistry`, which
 * drives the UI (format options, environment gating) from the registered set.
 */
export interface Converter<O = Record<string, unknown>> {
  /** Stable unique id, e.g. "image" | "pdf-to-image" | "media-download". */
  id: string;
  /** Accepted source formats / MIME types. */
  inputs: readonly string[];
  /** Producible target formats. */
  outputs: readonly string[];
  environment: Environment;
  convert(
    file: File | Blob,
    target: string,
    options: O,
    ctx?: ConvertContext,
  ): Promise<Result<ConversionOutput>>;
}
