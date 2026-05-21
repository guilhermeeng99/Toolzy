import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// Free OFL substitute for the proprietary Gilroy (see docs/specs/design-system.md §1).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Toolzy: free, private file tools",
  description:
    "Convert, compress, and resize images, PDFs, and media right in your browser. Nothing is uploaded.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
