import { DownloadIcon, FileIcon, ImageIcon, MediaIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ToolIcon, ToolMeta } from "@/lib/tools";
import Link from "next/link";

const ICONS: Record<ToolIcon, typeof ImageIcon> = {
  image: ImageIcon,
  file: FileIcon,
  media: MediaIcon,
  download: DownloadIcon,
};

export function ToolCard({ tool }: { tool: ToolMeta }) {
  const Icon = ICONS[tool.icon];

  const card = (
    <Card className="group flex h-full flex-col gap-4 p-6 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-pale-gray text-action-blue">
          <Icon />
        </span>
        {tool.env === "desktop" ? (
          <Badge>Desktop app</Badge>
        ) : tool.status === "soon" ? (
          <Badge>Soon</Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-heading font-semibold text-midnight-indigo">{tool.name}</h3>
        <p className="text-body-lg text-slate-blue">{tool.description}</p>
      </div>
    </Card>
  );

  return (
    <Link
      href={tool.href}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-blue focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}
