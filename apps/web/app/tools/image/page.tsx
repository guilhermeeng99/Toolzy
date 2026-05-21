import { ToolPage } from "@/components/tool-page";
import { ImageTool } from "@/components/tools/image-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image converter | Toolzy",
  description:
    "Convert, compress, and resize PNG, JPG, and WebP in your browser. Nothing is uploaded.",
};

export default function ImageToolPage() {
  return (
    <ToolPage
      title="Image converter"
      description="Convert, compress, and resize PNG, JPG, and WebP. Everything runs on your device."
    >
      <ImageTool />
    </ToolPage>
  );
}
