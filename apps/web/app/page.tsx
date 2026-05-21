import { ShieldIcon } from "@/components/icons";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ToolCard } from "@/components/tool-card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { TOOLS } from "@/lib/tools";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* Decorative abstract accent shapes (design-system §9). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-skybound-blue/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-lavender-glow/20 blur-3xl"
          />

          <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pt-24 pb-16 text-center">
            <Badge>No upload · No account · Open source</Badge>
            <h1 className="mt-6 max-w-3xl text-display-sm font-bold text-midnight-indigo md:text-display lg:text-display-lg">
              All your file tools, 100% private
            </h1>
            <p className="mt-6 max-w-2xl text-subheading text-slate-blue">
              Convert, compress, and resize images, PDFs, and media right in your browser. Files are
              processed on your device and never uploaded.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <a href="#tools" className={buttonClasses("primary", "lg")}>
                Start converting
              </a>
              <a href="#tools" className={buttonClasses("ghost", "lg")}>
                Get the desktop app
              </a>
            </div>
          </div>
        </section>

        {/* Tools grid */}
        <section id="tools" className="mx-auto max-w-[1200px] px-6 py-16">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-display-sm font-bold text-midnight-indigo">
              Every tool, right in your browser
            </h2>
            <p className="mt-3 text-body-lg text-slate-blue">
              More tools land each release. Track progress in the roadmap.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} />
            ))}
          </div>
        </section>

        {/* Privacy strip */}
        <section className="bg-cloud-mist">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-pale-gray text-action-blue">
              <ShieldIcon width={28} height={28} />
            </span>
            <h2 className="max-w-2xl text-heading-lg font-bold text-midnight-indigo">
              Privacy by design
            </h2>
            <p className="max-w-xl text-body-lg text-slate-blue">
              Browser tools run entirely on your machine using WebAssembly. There is no server to
              upload to, because there isn&apos;t one.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
