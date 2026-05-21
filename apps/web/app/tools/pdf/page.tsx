import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PdfTool } from "@/components/tools/pdf-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PDF tools | Toolzy",
  description: "Turn PDF pages into images or build a PDF from images, all in your browser.",
};

export default function PdfToolPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1000px] px-6 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">PDF tools</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">
            Convert PDF pages to images, or combine images into a PDF. Nothing leaves your device.
          </p>
        </header>
        <PdfTool />
      </main>
      <SiteFooter />
    </>
  );
}
