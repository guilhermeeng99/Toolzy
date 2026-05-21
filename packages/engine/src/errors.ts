import type { ToolzyError } from "./types";

/** Normalize an unknown thrown value to a short message string. */
export function causeMessage(cause: unknown): string | undefined {
  if (cause == null) return undefined;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Constructors for every `ToolzyError` kind. */
export const errors = {
  unsupportedFormat: (from: string, to: string): ToolzyError => ({
    kind: "unsupported_format",
    from,
    to,
  }),
  fileTooLarge: (size: number, max: number): ToolzyError => ({
    kind: "file_too_large",
    size,
    max,
  }),
  decodeFailed: (format: string, cause?: unknown): ToolzyError => ({
    kind: "decode_failed",
    format,
    cause: causeMessage(cause),
  }),
  encodeFailed: (format: string, cause?: unknown): ToolzyError => ({
    kind: "encode_failed",
    format,
    cause: causeMessage(cause),
  }),
  workerFailed: (cause?: unknown): ToolzyError => ({
    kind: "worker_failed",
    cause: causeMessage(cause),
  }),
  sidecarFailed: (tool: string, code?: number, stderr?: string): ToolzyError => ({
    kind: "sidecar_failed",
    tool,
    code,
    stderr,
  }),
  canceled: (): ToolzyError => ({ kind: "canceled" }),
};

/** Default English description. The UI may override per locale. */
export function describeError(e: ToolzyError): string {
  switch (e.kind) {
    case "unsupported_format":
      return `Can't convert from ${e.from} to ${e.to}.`;
    case "file_too_large":
      return `File is too large (${formatBytes(e.size)}; max ${formatBytes(e.max)}).`;
    case "decode_failed":
      return `Could not read the ${e.format} file.`;
    case "encode_failed":
      return `Could not write the ${e.format} file.`;
    case "worker_failed":
      return "Processing failed in the background worker.";
    case "sidecar_failed":
      return `The ${e.tool} tool failed${e.code != null ? ` (code ${e.code})` : ""}.`;
    case "canceled":
      return "Canceled.";
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
