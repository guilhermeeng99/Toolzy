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
