import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Engine + framework-free app helpers. DOM/WASM-bound code (canvas, ffmpeg,
    // pdf) is covered by e2e (planned), not these node unit tests.
    include: ["packages/**/src/**/*.test.ts", "apps/web/**/*.test.{ts,tsx}"],
  },
});
