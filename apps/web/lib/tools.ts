export type ToolStatus = "live" | "soon";
export type ToolEnv = "browser" | "desktop";
export type ToolIcon = "image" | "file" | "media" | "download";

export interface ToolMeta {
  slug: string;
  name: string;
  description: string;
  href: string;
  icon: ToolIcon;
  status: ToolStatus;
  env: ToolEnv;
}

/** Marketing-level catalog driving the landing grid. Mirrors the roadmap phases. */
export const TOOLS: ToolMeta[] = [
  {
    slug: "image-convert",
    name: "Image converter",
    description: "Convert between PNG, JPG, and WebP.",
    href: "/tools/image",
    icon: "image",
    status: "live",
    env: "browser",
  },
  {
    slug: "image-compress",
    name: "Compress & resize",
    description: "Shrink file size with a live preview, or resize by pixels or percent.",
    href: "/tools/image",
    icon: "image",
    status: "live",
    env: "browser",
  },
  {
    slug: "pdf-to-image",
    name: "PDF and image",
    description: "Turn PDF pages into images, or merge images into a PDF.",
    href: "#",
    icon: "file",
    status: "soon",
    env: "browser",
  },
  {
    slug: "media-convert",
    name: "Media converter",
    description: "Convert your own audio and video, like MP4 to MP3, on your device.",
    href: "#",
    icon: "media",
    status: "soon",
    env: "browser",
  },
  {
    slug: "media-download",
    name: "Media downloader",
    description: "Save audio and video from a link as MP4 or MP3. Desktop app only.",
    href: "#",
    icon: "download",
    status: "soon",
    env: "desktop",
  },
];
