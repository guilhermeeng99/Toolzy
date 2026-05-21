import { ToolPage } from "@/components/tool-page";
import { DownloadTool } from "@/components/tools/download-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media downloader | Toolzy",
  description: "Download audio and video from a link as MP4 or MP3 with the Toolzy desktop app.",
};

export default function DownloadToolPage() {
  return (
    <ToolPage
      title="Media downloader"
      description="Save audio and video from a link. Runs on your own device and connection."
      width="narrow"
    >
      <DownloadTool />
    </ToolPage>
  );
}
