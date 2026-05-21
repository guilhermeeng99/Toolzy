import { describe, expect, it } from "vitest";
import { formatBytes, sizeDelta } from "./format";

describe("formatBytes", () => {
  it("shows bytes under 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("rounds KB to whole numbers", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB");
  });

  it("shows MB with one decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("sizeDelta", () => {
  it("reports shrinkage as a negative percent", () => {
    expect(sizeDelta(100, 28)).toBe("-72%");
  });

  it("reports growth as a positive percent", () => {
    expect(sizeDelta(100, 105)).toBe("+5%");
  });

  it("is empty when the original size is unknown", () => {
    expect(sizeDelta(0, 10)).toBe("");
  });

  it("treats no change as -0%", () => {
    expect(sizeDelta(100, 100)).toBe("-0%");
  });
});
