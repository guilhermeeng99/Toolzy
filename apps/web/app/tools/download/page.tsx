import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DownloadTool } from "@/components/tools/download-tool";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media downloader | Toolzy",
  description: "Download audio and video from a link as MP4 or MP3 with the Toolzy desktop app.",
};

export default function DownloadToolPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[800px] px-6 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">Media downloader</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">
            Save audio and video from a link. Runs on your own device and connection.
          </p>
        </header>
        <DownloadTool />
      </main>
      <SiteFooter />
    </>
  );
}
