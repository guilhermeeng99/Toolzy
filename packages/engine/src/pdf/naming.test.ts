import { describe, expect, it } from "vitest";
import { padPageName } from "./naming";

describe("padPageName", () => {
  it("pads to at least 2 digits", () => {
    expect(padPageName("doc", 2, 9, "png")).toBe("doc-02.png");
  });

  it("widens padding for larger totals", () => {
    expect(padPageName("doc", 7, 120, "jpg")).toBe("doc-007.jpg");
  });

  it("falls back to 'page' for an empty base", () => {
    expect(padPageName("", 1, 1, "png")).toBe("page-01.png");
  });
});
