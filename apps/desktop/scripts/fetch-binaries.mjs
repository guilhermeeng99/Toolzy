// Fetches the yt-dlp sidecar into src-tauri/binaries with the Tauri target-triple
// suffix. ffmpeg is distributed as an archive per platform, so this prints where
// to get it rather than guessing. Run from apps/desktop: `node scripts/fetch-binaries.mjs`.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TRIPLES = {
  "win32-x64": { triple: "x86_64-pc-windows-msvc", exe: ".exe", ytdlp: "yt-dlp.exe" },
  "darwin-arm64": { triple: "aarch64-apple-darwin", exe: "", ytdlp: "yt-dlp_macos" },
  "darwin-x64": { triple: "x86_64-apple-darwin", exe: "", ytdlp: "yt-dlp_macos" },
  "linux-x64": { triple: "x86_64-unknown-linux-gnu", exe: "", ytdlp: "yt-dlp" },
};

const key = `${process.platform}-${process.arch}`;
const target = TRIPLES[key];
if (!target) {
  console.error(`Unsupported platform: ${key}. Add it to TRIPLES.`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const binDir = join(here, "..", "src-tauri", "binaries");
await mkdir(binDir, { recursive: true });

const ytdlpUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${target.ytdlp}`;
const dest = join(binDir, `yt-dlp-${target.triple}${target.exe}`);

console.log(`Downloading ${ytdlpUrl}`);
const res = await fetch(ytdlpUrl);
if (!res.ok) {
  console.error(`Failed to download yt-dlp: ${res.status}`);
  process.exit(1);
}
await writeFile(dest, Buffer.from(await res.arrayBuffer()));
if (target.exe === "") await chmod(dest, 0o755);
console.log(`Saved ${dest}`);

console.log(
  [
    "",
    `Next: place ffmpeg as ffmpeg-${target.triple}${target.exe} in ${binDir}`,
    "  Windows/Linux: https://www.gyan.dev/ffmpeg/builds/ or https://johnvansickle.com/ffmpeg/",
    "  macOS: https://evermeet.cx/ffmpeg/ (or `brew install ffmpeg` then copy the binary)",
  ].join("\n"),
);
