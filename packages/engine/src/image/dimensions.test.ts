import { describe, expect, it } from "vitest";
import { computeTargetDimensions } from "./dimensions";

const src = { width: 1000, height: 500 };

describe("computeTargetDimensions", () => {
  it("keeps source size when mode is none or undefined", () => {
    expect(computeTargetDimensions(src)).toEqual(src);
    expect(computeTargetDimensions(src, { mode: "none", keepAspectRatio: true })).toEqual(src);
  });

  it("scales by percent and caps at 100 (no upscale)", () => {
    expect(
      computeTargetDimensions(src, { mode: "percent", percent: 50, keepAspectRatio: true }),
    ).toEqual({
      width: 500,
      height: 250,
    });
    expect(
      computeTargetDimensions(src, { mode: "percent", percent: 200, keepAspectRatio: true }),
    ).toEqual(src);
  });

  it("px keep-aspect with one dimension derives the other", () => {
    expect(computeTargetDimensions(src, { mode: "px", width: 500, keepAspectRatio: true })).toEqual(
      {
        width: 500,
        height: 250,
      },
    );
  });

  it("px keep-aspect with both dimensions fits inside the box", () => {
    expect(
      computeTargetDimensions(src, { mode: "px", width: 400, height: 400, keepAspectRatio: true }),
    ).toEqual({ width: 400, height: 200 });
  });

  it("px without keep-aspect stretches to exact size", () => {
    expect(
      computeTargetDimensions(src, { mode: "px", width: 300, height: 300, keepAspectRatio: false }),
    ).toEqual({ width: 300, height: 300 });
  });

  it("never returns a dimension below 1", () => {
    expect(
      computeTargetDimensions(
        { width: 1, height: 1 },
        { mode: "percent", percent: 1, keepAspectRatio: true },
      ),
    ).toEqual({
      width: 1,
      height: 1,
    });
  });
});
