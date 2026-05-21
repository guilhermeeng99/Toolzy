import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { MediaTool } from "@/components/tools/media-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media converter | Toolzy",
  description: "Convert your own audio and video to MP3, M4A, or WAV in your browser.",
};

export default function MediaToolPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1000px] px-6 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">Media converter</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">
            Extract or convert audio from your own files, like MP4 to MP3. Everything runs on your
            device.
          </p>
        </header>
        <MediaTool />
      </main>
      <SiteFooter />
    </>
  );
}
