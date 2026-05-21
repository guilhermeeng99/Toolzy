import { useEffect, useState } from "react";
import { DownloadTool } from "./components/DownloadTool";
import { ImageTool } from "./components/ImageTool";
import { MediaTool } from "./components/MediaTool";
import { PdfTool } from "./components/PdfTool";
import { pill } from "./components/ui";
import { type Update, checkForUpdate, getVersion, installUpdate } from "./lib/update";

type Tool = "image" | "pdf" | "media" | "download";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "pdf", label: "PDF" },
  { id: "media", label: "Media" },
  { id: "download", label: "Download" },
];

const TOOL_META: Record<Tool, { title: string; description: string }> = {
  image: {
    title: "Image converter",
    description: "Convert and resize images natively — PNG, JPG, WebP, GIF, BMP, TIFF.",
  },
  pdf: {
    title: "PDF tools",
    description: "Render PDF pages to images, or combine images into a PDF — all native.",
  },
  media: {
    title: "Media converter",
    description: "Extract or convert audio from your files, like MP4 to MP3 — native ffmpeg.",
  },
  download: {
    title: "Media downloader",
    description: "Save audio and video from a link as MP4 or MP3, on your own connection.",
  },
};

function ToolView({ tool }: { tool: Tool }) {
  if (tool === "image") return <ImageTool />;
  if (tool === "pdf") return <PdfTool />;
  if (tool === "media") return <MediaTool />;
  return <DownloadTool />;
}

export function App() {
  const [tool, setTool] = useState<Tool>("image");
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [updating, setUpdating] = useState(false);
  const meta = TOOL_META[tool];

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
    checkForUpdate().then(setUpdate);
  }, []);

  async function applyUpdate() {
    if (!update) return;
    setUpdating(true);
    try {
      await installUpdate(update); // downloads, installs, relaunches
    } catch {
      setUpdating(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-outline-gray bg-snow-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1000px] items-center gap-4 px-6">
          <span className="text-heading font-bold text-midnight-indigo">Toolzy</span>
          <span className="rounded-full bg-pale-gray px-2 py-1 text-body font-semibold text-glacier-blue">
            native
          </span>
          <nav className="ml-auto flex gap-2">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                className={pill(tool === t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {update ? (
            <button
              type="button"
              onClick={applyUpdate}
              disabled={updating}
              className="rounded-lg bg-action-blue px-3 py-1.5 text-body font-semibold text-snow-white transition hover:brightness-105 disabled:opacity-50"
            >
              {updating ? "Updating..." : `Update to v${update.version}`}
            </button>
          ) : version ? (
            <span className="text-body text-slate-blue">v{version}</span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">{meta.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">{meta.description}</p>
        </header>
        <ToolView tool={tool} />
      </main>
    </div>
  );
}
