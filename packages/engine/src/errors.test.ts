import { describe, expect, it } from "vitest";
import { causeMessage, describeError, errors } from "./errors";
import type { ToolzyError } from "./types";

describe("causeMessage", () => {
  it("returns undefined for null/undefined", () => {
    expect(causeMessage(null)).toBeUndefined();
    expect(causeMessage(undefined)).toBeUndefined();
  });

  it("uses Error.message", () => {
    expect(causeMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(causeMessage("nope")).toBe("nope");
    expect(causeMessage(42)).toBe("42");
  });
});

describe("error constructors", () => {
  it("carry their discriminant and fields", () => {
    expect(errors.unsupportedFormat("gif", "jpg")).toEqual({
      kind: "unsupported_format",
      from: "gif",
      to: "jpg",
    });
    expect(errors.fileTooLarge(10, 5)).toEqual({ kind: "file_too_large", size: 10, max: 5 });
    expect(errors.canceled()).toEqual({ kind: "canceled" });
  });

  it("normalize the cause to a message string", () => {
    const e = errors.decodeFailed("png", new Error("bad"));
    expect(e).toMatchObject({ kind: "decode_failed", format: "png", cause: "bad" });
  });
});

describe("describeError", () => {
  // One readable, non-empty message per kind — the UI never shows a raw exception.
  const samples: ToolzyError[] = [
    errors.unsupportedFormat("gif", "jpg"),
    errors.fileTooLarge(150 * 1024 * 1024, 100 * 1024 * 1024),
    errors.decodeFailed("png"),
    errors.encodeFailed("webp"),
    errors.workerFailed(),
    errors.sidecarFailed("yt-dlp", 1, "stderr tail"),
    errors.canceled(),
  ];

  it.each(samples)("describes %o", (e) => {
    const msg = describeError(e);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("formats sizes in the file_too_large message", () => {
    const msg = describeError(errors.fileTooLarge(150 * 1024 * 1024, 100 * 1024 * 1024));
    expect(msg).toContain("150.0 MB");
    expect(msg).toContain("100.0 MB");
  });

  it("includes the sidecar exit code when present", () => {
    expect(describeError(errors.sidecarFailed("yt-dlp", 2))).toContain("2");
  });
});
