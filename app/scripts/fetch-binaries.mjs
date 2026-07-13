// Fetch the native binaries the app bundles, so end users install nothing extra.
// Run from app/:  node scripts/fetch-binaries.mjs
//
// - yt-dlp + ffmpeg  -> src-tauri/binaries/<name>-<target-triple><exe>  (Tauri externalBin sidecars)
// - pdfium (dynamic library) -> src-tauri/pdfium/<lib>  (bundled as a resource)
//
// Extraction uses `tar` (bsdtar ships with Windows 10+/macOS/Linux and reads zip/tgz/txz).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcTauri = join(here, "..", "src-tauri");
const binDir = join(srcTauri, "binaries");
const pdfiumDir = join(srcTauri, "pdfium");
const YTDLP_VERSION = (await readFile(join(srcTauri, "ytdlp-version.txt"), "utf8")).trim();

const TARGETS = {
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    exe: ".exe",
    ytdlp: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp.exe`,
    ffmpeg: {
      url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
      member: "ffmpeg.exe",
    },
    pdfium: {
      url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz",
      member: "pdfium.dll",
    },
    // qpdf (Apache-2.0) — PDF merge / encrypt / decrypt. The MSVC zip ships
    // qpdf.exe plus a few sibling DLLs; both are placed in binaries/.
    qpdf: {
      url: "https://github.com/qpdf/qpdf/releases/download/v12.2.0/qpdf-12.2.0-msvc64.zip",
      member: "qpdf.exe",
    },
    // whisper.cpp CLI (MIT) — local speech-to-text. CPU build; ships whisper-cli.exe
    // plus sibling ggml/whisper DLLs, handled like qpdf.
    whisper: {
      url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
      member: "whisper-cli.exe",
    },
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-gnu",
    exe: "",
    ytdlp: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp`,
    ffmpeg: {
      url: "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
      member: "ffmpeg",
    },
    pdfium: {
      url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-linux-x64.tgz",
      member: "libpdfium.so",
    },
  },
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    exe: "",
    ytdlp: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_macos`,
    ffmpeg: { url: "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip", member: "ffmpeg" },
    pdfium: {
      url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-arm64.tgz",
      member: "libpdfium.dylib",
    },
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    exe: "",
    ytdlp: `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_macos`,
    ffmpeg: { url: "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip", member: "ffmpeg" },
    pdfium: {
      url: "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-x64.tgz",
      member: "libpdfium.dylib",
    },
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

/** Some Windows sidecars (qpdf, whisper-cli) ship as an .exe + sibling DLLs. Copy
 *  the exe as the sidecar and every DLL beside it, so the exe finds its libs both at
 *  dev time (`shell().sidecar`) and in the bundle (resources `binaries/*.dll`). */
async function fetchExeWithDlls({ url, member }, exeDest, label) {
  const tmp = join(srcTauri, `.fetch-tmp-${label}`);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const archive = join(tmp, "archive");
  await download(url, archive);
  execFileSync("tar", ["-xf", archive, "-C", tmp], { stdio: "inherit" });
  const exe = await findFile(tmp, member);
  if (!exe) throw new Error(`'${member}' not found in ${url}`);
  await copyFile(exe, exeDest);
  console.log(`✓ ${exeDest}`);
  const dllDir = dirname(exeDest);
  const dlls = (await readdir(dirname(exe))).filter((n) => n.toLowerCase().endsWith(".dll"));
  for (const dll of dlls) await copyFile(join(dirname(exe), dll), join(dllDir, dll));
  await rm(tmp, { recursive: true, force: true });
  console.log(`✓ ${label} DLLs (${dlls.length}) -> ${dllDir}`);
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
const fetchedYtdlpVersion = execFileSync(ytdlpDest, ["--version"], { encoding: "utf8" }).trim();
if (fetchedYtdlpVersion !== YTDLP_VERSION) {
  throw new Error(`yt-dlp version mismatch: expected ${YTDLP_VERSION}, got ${fetchedYtdlpVersion}`);
}
console.log(`✓ ${ytdlpDest}`);

// ffmpeg (from archive) -> sidecar
const ffmpegDest = join(binDir, `ffmpeg-${t.triple}${t.exe}`);
await fetchFromArchive(t.ffmpeg, ffmpegDest);
if (!t.exe) await chmod(ffmpegDest, 0o755);

// qpdf (from zip) -> sidecar + sibling DLLs. Windows auto-fetches; other OSes
// install via a package manager (apt/brew) until a static build is added here.
if (t.qpdf) {
  await fetchExeWithDlls(t.qpdf, join(binDir, `qpdf-${t.triple}${t.exe}`), "qpdf");
} else {
  console.log(
    `• qpdf: no auto-fetch for this platform yet — install via your package manager (e.g. \`brew install qpdf\`, \`apt install qpdf\`) and copy it to binaries/qpdf-${t.triple}${t.exe}.`,
  );
}

// whisper-cli (from zip) -> sidecar + sibling DLLs (ggml/whisper libs). Local
// transcription. Windows auto-fetches; other OSes build whisper.cpp from source
// (https://github.com/ggml-org/whisper.cpp) until a static build is added here.
if (t.whisper) {
  await fetchExeWithDlls(t.whisper, join(binDir, `whisper-cli-${t.triple}${t.exe}`), "whisper");
} else {
  console.log(
    `• whisper-cli: no auto-fetch for this platform yet — build whisper.cpp and copy whisper-cli to binaries/whisper-cli-${t.triple}${t.exe}.`,
  );
}

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
