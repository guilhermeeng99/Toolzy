import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/cn";

const WIDTHS = {
  default: "max-w-[1000px]",
  narrow: "max-w-[800px]",
} as const;

/**
 * Shared chrome for every `/tools/*` page: header, centered title + lead, footer.
 * Each page supplies only its title, lead, and tool body — keeping the routes
 * free of duplicated layout.
 */
export function ToolPage({
  title,
  description,
  width = "default",
  children,
}: {
  title: string;
  description: string;
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className={cn("mx-auto px-6 py-12", WIDTHS[width])}>
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">{title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">{description}</p>
        </header>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
