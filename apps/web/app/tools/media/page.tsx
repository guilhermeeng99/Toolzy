import { ToolPage } from "@/components/tool-page";
import { MediaTool } from "@/components/tools/media-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media converter | Toolzy",
  description: "Convert your own audio and video to MP3, M4A, or WAV in your browser.",
};

export default function MediaToolPage() {
  return (
    <ToolPage
      title="Media converter"
      description="Extract or convert audio from your own files, like MP4 to MP3. Everything runs on your device."
    >
      <MediaTool />
    </ToolPage>
  );
}
