import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ImageTool } from "@/components/tools/image-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image converter | Toolzy",
  description:
    "Convert, compress, and resize PNG, JPG, and WebP in your browser. Nothing is uploaded.",
};

export default function ImageToolPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1000px] px-6 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">Image converter</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">
            Convert, compress, and resize PNG, JPG, and WebP. Everything runs on your device.
          </p>
        </header>
        <ImageTool />
      </main>
      <SiteFooter />
    </>
  );
}
