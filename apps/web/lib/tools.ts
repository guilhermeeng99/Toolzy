export type ToolStatus = "live" | "soon";
export type ToolEnv = "browser" | "desktop";
export type ToolIcon = "image" | "file" | "media" | "download";

export interface ToolMeta {
  slug: string;
  name: string;
  description: string;
  icon: ToolIcon;
  status: ToolStatus;
  env: ToolEnv;
}

/** Marketing-level catalog driving the landing grid. Mirrors the roadmap phases. */
export const TOOLS: ToolMeta[] = [
  {
    slug: "image-convert",
    name: "Image converter",
    description: "Convert between PNG, JPG, WebP, AVIF, and JPEG-XL.",
    icon: "image",
    status: "soon",
    env: "browser",
  },
  {
    slug: "image-compress",
    name: "Compress & resize",
    description: "Shrink file size with a live preview, or resize by pixels or percent.",
    icon: "image",
    status: "soon",
    env: "browser",
  },
  {
    slug: "pdf-to-image",
    name: "PDF ↔ image",
    description: "Turn PDF pages into images, or merge images into a PDF.",
    icon: "file",
    status: "soon",
    env: "browser",
  },
  {
    slug: "media-convert",
    name: "Media converter",
    description: "Convert your own audio and video, like MP4 to MP3, on your device.",
    icon: "media",
    status: "soon",
    env: "browser",
  },
  {
    slug: "media-download",
    name: "Media downloader",
    description: "Save audio/video from a link as MP4 or MP3. Desktop app only.",
    icon: "download",
    status: "soon",
    env: "desktop",
  },
];
