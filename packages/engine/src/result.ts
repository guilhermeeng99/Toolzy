import type { Result, ToolzyError } from "./types";

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = ToolzyError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok;
}

/**
 * Run an async function and convert any thrown value into a `ToolzyError`.
 * Keeps `try/catch` out of converter bodies.
 */
export async function attempt<T>(
  fn: () => Promise<T>,
  onError: (cause: unknown) => ToolzyError,
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(onError(cause));
  }
}
