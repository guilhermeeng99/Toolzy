// Fetch the native binaries the app bundles, so end users install nothing extra.
// Run from app/:  node scripts/fetch-binaries.mjs
//
// - yt-dlp + ffmpeg  -> src-tauri/binaries/<name>-<target-triple><exe>  (Tauri externalBin sidecars)
// - pdfium (dynamic library) -> src-tauri/pdfium/<lib>  (bundled as a resource)
//
// Extraction uses `tar` (bsdtar ships with Windows 10+/macOS/Linux and reads zip/tgz/txz).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcTauri = join(here, "..", "src-tauri");
const binDir = join(srcTauri, "binaries");
const pdfiumDir = join(srcTauri, "pdfium");

const TARGETS = {
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    exe: ".exe",
    ytdlp: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
    ffmpeg: { url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", member: "ffmpeg.exe" },
    pdfium: { url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz", member: "pdfium.dll" },
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-gnu",
    exe: "",
    ytdlp: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
    ffmpeg: { url: "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz", member: "ffmpeg" },
    pdfium: { url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-linux-x64.tgz", member: "libpdfium.so" },
  },
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    exe: "",
    ytdlp: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
    ffmpeg: { url: "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip", member: "ffmpeg" },
    pdfium: { url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-arm64.tgz", member: "libpdfium.dylib" },
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    exe: "",
    ytdlp: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
    ffmpeg: { url: "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip", member: "ffmpeg" },
    pdfium: { url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-x64.tgz", member: "libpdfium.dylib" },
  },
};

const key = `${process.platform}-${process.arch}`;
const t = TARGETS[key];
if (!t) {
  console.error(`Unsupported platform: ${key}. Add it to TARGETS.`);
  process.exit(1);
}

await mkdir(binDir, { recursive: true });
await mkdir(pdfiumDir, { recursive: true });

async function download(url, dest) {
  console.log(`↓ ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed (${res.status}) for ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Recursively find the first file named `name` under `dir`. */
async function findFile(dir, name) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = await findFile(p, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return p;
    }
  }
  return null;
}

/** Download an archive, extract it, and copy the named member to `dest`. */
async function fetchFromArchive({ url, member }, dest) {
  const tmp = join(srcTauri, ".fetch-tmp");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const archive = join(tmp, "archive");
  await download(url, archive);
  execFileSync("tar", ["-xf", archive, "-C", tmp], { stdio: "inherit" });
  const found = await findFile(tmp, member);
  if (!found) throw new Error(`'${member}' not found in ${url}`);
  await copyFile(found, dest);
  await rm(tmp, { recursive: true, force: true });
  console.log(`✓ ${dest}`);
}

// yt-dlp (direct binary) -> sidecar
const ytdlpDest = join(binDir, `yt-dlp-${t.triple}${t.exe}`);
await download(t.ytdlp, ytdlpDest);
if (!t.exe) await chmod(ytdlpDest, 0o755);
console.log(`✓ ${ytdlpDest}`);

// ffmpeg (from archive) -> sidecar
const ffmpegDest = join(binDir, `ffmpeg-${t.triple}${t.exe}`);
await fetchFromArchive(t.ffmpeg, ffmpegDest);
if (!t.exe) await chmod(ffmpegDest, 0o755);

// pdfium (from archive) -> resource dir
const pdfiumDest = join(pdfiumDir, t.pdfium.member);
await fetchFromArchive(t.pdfium, pdfiumDest);

// Dev convenience: pdfium is loaded from the executable's dir; copy it next to the
// dev build if that dir already exists.
for (const profile of ["debug", "release"]) {
  const out = join(srcTauri, "target", profile);
  if (existsSync(out)) {
    await copyFile(pdfiumDest, join(out, t.pdfium.member));
    console.log(`✓ ${join(out, t.pdfium.member)} (dev)`);
  }
}

console.log("\nAll binaries fetched. They are gitignored and bundled at build time.");
