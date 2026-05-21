import { describe, expect, it } from "vitest";
import { ConverterRegistry } from "./registry";
import { ok } from "./result";
import type { Converter } from "./types";

function fakeConverter(over: Partial<Converter> = {}): Converter {
  return {
    id: "fake",
    inputs: ["image/png"],
    outputs: ["jpg"],
    environment: "both",
    convert: async () => ok({ blob: new Blob(), format: "jpg", filename: "x.jpg", bytes: 0 }),
    ...over,
  };
}

describe("ConverterRegistry", () => {
  it("registers and gets by id", () => {
    const r = new ConverterRegistry();
    const c = fakeConverter();
    r.register(c);
    expect(r.get("fake")).toBe(c);
    expect(r.has("fake")).toBe(true);
  });

  it("throws on duplicate id", () => {
    const r = new ConverterRegistry();
    r.register(fakeConverter());
    expect(() => r.register(fakeConverter())).toThrow();
  });

  it("find matches input and output", () => {
    const r = new ConverterRegistry();
    r.register(fakeConverter());
    expect(r.find("image/png", "jpg")?.id).toBe("fake");
    expect(r.find("image/png", "gif")).toBeUndefined();
  });

  it("list filters by environment", () => {
    const r = new ConverterRegistry();
    r.register(fakeConverter({ id: "browser-only", environment: "browser" }));
    r.register(fakeConverter({ id: "desktop-only", environment: "desktop" }));
    const browser = r.list("browser").map((c) => c.id);
    expect(browser).toContain("browser-only");
    expect(browser).not.toContain("desktop-only");
  });
});
