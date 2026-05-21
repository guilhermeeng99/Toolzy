import { describe, expect, it } from "vitest";
import { attempt, err, isErr, isOk, ok } from "./result";

describe("result", () => {
  it("ok wraps a value", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r) && r.value).toBe(42);
  });

  it("err wraps an error", () => {
    const r = err({ kind: "canceled" } as const);
    expect(isErr(r)).toBe(true);
  });

  it("attempt returns ok on success", async () => {
    const r = await attempt(
      async () => 1,
      () => ({ kind: "canceled" }),
    );
    expect(r).toEqual({ ok: true, value: 1 });
  });

  it("attempt maps a throw to a ToolzyError", async () => {
    const r = await attempt(
      async () => {
        throw new Error("boom");
      },
      (c) => ({ kind: "decode_failed", format: "png", cause: String(c) }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("decode_failed");
    }
  });
});
