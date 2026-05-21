import { describe, expect, it } from "vitest";
import { computePdfPageBox } from "./page-size";

describe("computePdfPageBox", () => {
  it("fit makes the page match the image", () => {
    expect(computePdfPageBox({ width: 800, height: 600 }, { pageSize: "fit" })).toEqual({
      pageW: 800,
      pageH: 600,
      x: 0,
      y: 0,
      drawW: 800,
      drawH: 600,
    });
  });

  it("a4 portrait fits a wide image and centers it", () => {
    const box = computePdfPageBox({ width: 2000, height: 1000 }, { pageSize: "a4" });
    expect(box.pageW).toBeCloseTo(595.28);
    expect(box.pageH).toBeCloseTo(841.89);
    // Width-constrained: drawW spans the full page width.
    expect(box.drawW).toBeCloseTo(595.28);
    expect(box.drawH).toBeCloseTo(297.64);
    expect(box.x).toBeCloseTo(0);
    expect(box.y).toBeCloseTo((841.89 - 297.64) / 2);
  });

  it("respects margins", () => {
    const box = computePdfPageBox({ width: 1000, height: 1000 }, { pageSize: "a4", margin: 20 });
    expect(box.drawW).toBeCloseTo(595.28 - 40);
    expect(box.x).toBeCloseTo(20);
  });

  it("landscape swaps the page dimensions", () => {
    const box = computePdfPageBox(
      { width: 1000, height: 1000 },
      { pageSize: "letter", orientation: "landscape" },
    );
    expect(box.pageW).toBe(792);
    expect(box.pageH).toBe(612);
  });
});
