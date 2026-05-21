// Copies the pdf.js worker into public/ so it can be served at /pdf.worker.min.mjs.
// Runs before dev/build (see package.json). Keeps the worker version in sync with
// the installed pdfjs-dist instead of committing a binary blob.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkg = require.resolve("pdfjs-dist/package.json");
const src = join(dirname(pkg), "build", "pdf.worker.min.mjs");

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "..", "public", "pdf.worker.min.mjs");

await mkdir(dirname(dest), { recursive: true });
await copyFile(src, dest);
console.log(`[copy-pdf-worker] ${src} -> ${dest}`);
