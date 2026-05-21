import { ToolPage } from "@/components/tool-page";
import { PdfTool } from "@/components/tools/pdf-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF tools | Toolzy",
  description: "Turn PDF pages into images or build a PDF from images, all in your browser.",
};

export default function PdfToolPage() {
  return (
    <ToolPage
      title="PDF tools"
      description="Convert PDF pages to images, or combine images into a PDF. Nothing leaves your device."
    >
      <PdfTool />
    </ToolPage>
  );
}
