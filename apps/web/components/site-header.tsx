import { GithubIcon, ToolzyLogo } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { SITE } from "@/lib/site";

const NAV = [
  { label: "Images", href: "#tools" },
  { label: "PDF", href: "#tools" },
  { label: "Media", href: "#tools" },
  { label: "Roadmap", href: "#tools" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-outline-gray bg-snow-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2 text-action-blue">
          <ToolzyLogo />
          <span className="text-heading font-bold text-midnight-indigo">Toolzy</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-body-lg font-medium text-midnight-indigo transition-colors hover:text-action-blue"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={SITE.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 text-body-lg font-medium text-midnight-indigo transition-colors hover:text-action-blue sm:inline-flex"
          >
            <GithubIcon width={20} height={20} />
            GitHub
          </a>
          <a href="#tools" className={buttonClasses("primary", "md")}>
            Get the desktop app
          </a>
        </div>
      </div>
    </header>
  );
}
