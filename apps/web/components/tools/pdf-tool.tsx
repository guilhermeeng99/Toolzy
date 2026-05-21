"use client";

import { ImagesToPdf } from "@/components/tools/images-to-pdf";
import { PdfToImages } from "@/components/tools/pdf-to-images";
import { cn } from "@/lib/cn";
import { useState } from "react";

type Mode = "to-images" | "to-pdf";

export function PdfTool() {
  const [mode, setMode] = useState<Mode>("to-images");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center gap-2">
        <Tab active={mode === "to-images"} onClick={() => setMode("to-images")}>
          PDF to images
        </Tab>
        <Tab active={mode === "to-pdf"} onClick={() => setMode("to-pdf")}>
          Images to PDF
        </Tab>
      </div>
      {mode === "to-images" ? <PdfToImages /> : <ImagesToPdf />}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-5 py-2 text-body-lg font-semibold transition-colors",
        active
          ? "bg-action-blue text-snow-white"
          : "bg-pale-gray text-midnight-indigo hover:bg-platinum-tint",
      )}
    >
      {children}
    </button>
  );
}
