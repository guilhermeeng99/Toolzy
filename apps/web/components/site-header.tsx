import { ToolzyLogo } from "@/components/icons";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-outline-gray bg-snow-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center px-6">
        <a href="/" className="flex items-center gap-2 text-action-blue">
          <ToolzyLogo />
          <span className="text-heading font-bold text-midnight-indigo">Toolzy</span>
        </a>
      </div>
    </header>
  );
}
