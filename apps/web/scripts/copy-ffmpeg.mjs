// Copies the single-thread ffmpeg.wasm core into public/ffmpeg so it can be
// served same-origin and loaded lazily (~30 MB, on first use). Runs before
// dev/build. Keeps the core version in sync with the installed @ffmpeg/core.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// @ffmpeg/core's exports map does not expose package.json; resolve the main entry
// (dist/umd/ffmpeg-core.js) and take its directory.
const coreJs = require.resolve("@ffmpeg/core");
const distDir = dirname(coreJs);

const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, "..", "public", "ffmpeg");
await mkdir(destDir, { recursive: true });

for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  await copyFile(join(distDir, name), join(destDir, name));
  console.log(`[copy-ffmpeg] ${name} -> ${join(destDir, name)}`);
}
