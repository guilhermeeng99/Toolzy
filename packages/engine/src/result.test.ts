import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok } from "./result";

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

  it("isOk and isErr narrow the union", () => {
    const good = ok("v");
    const bad = err({ kind: "canceled" } as const);
    expect(isOk(good)).toBe(true);
    expect(isErr(good)).toBe(false);
    expect(isOk(bad)).toBe(false);
    expect(isErr(bad)).toBe(true);
  });
});
