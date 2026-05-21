"use client";

import { pillClass } from "@/components/tools/controls";
import { ImagesToPdf } from "@/components/tools/images-to-pdf";
import { PdfToImages } from "@/components/tools/pdf-to-images";
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
    <button type="button" onClick={onClick} className={pillClass(active, "px-5 py-2 text-body-lg")}>
      {children}
    </button>
  );
}
