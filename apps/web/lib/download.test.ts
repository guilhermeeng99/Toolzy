import { describe, expect, it } from "vitest";
import { uniqueName } from "./download";

describe("uniqueName", () => {
  it("returns the name unchanged when free", () => {
    const taken = new Set<string>();
    expect(uniqueName("a.png", taken)).toBe("a.png");
    expect(taken.has("a.png")).toBe(true);
  });

  it("appends an incrementing suffix before the extension", () => {
    const taken = new Set<string>(["a.png"]);
    expect(uniqueName("a.png", taken)).toBe("a (1).png");
    expect(uniqueName("a.png", taken)).toBe("a (2).png");
  });

  it("handles names without an extension", () => {
    const taken = new Set<string>(["README"]);
    expect(uniqueName("README", taken)).toBe("README (1)");
  });

  it("only treats the last dot as the extension boundary", () => {
    const taken = new Set<string>(["a.b.c"]);
    expect(uniqueName("a.b.c", taken)).toBe("a.b (1).c");
  });
});
