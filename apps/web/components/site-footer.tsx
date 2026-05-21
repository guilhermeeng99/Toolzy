import { GithubIcon, LinkedinIcon, ToolzyLogo } from "@/components/icons";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-outline-gray bg-cloud-mist">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2 text-action-blue">
          <ToolzyLogo width={20} height={20} />
          <span className="text-body-lg font-bold text-midnight-indigo">Toolzy</span>
        </div>
        <p className="order-last text-body text-slate-blue sm:order-none">
          Open source · MIT · Your files never leave your device.
        </p>
        <nav className="flex items-center gap-5">
          <a
            href={SITE.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-body-lg font-medium text-midnight-indigo transition-colors hover:text-action-blue"
          >
            <GithubIcon width={20} height={20} />
            Repository
          </a>
          <a
            href={SITE.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-body-lg font-medium text-midnight-indigo transition-colors hover:text-action-blue"
          >
            <LinkedinIcon width={20} height={20} />
            LinkedIn
          </a>
        </nav>
      </div>
    </footer>
  );
}
