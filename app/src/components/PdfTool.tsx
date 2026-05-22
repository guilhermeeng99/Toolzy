import { useState } from "react";
import { CompressPdf } from "./pdf/CompressPdf";
import { ImagesToPdf } from "./pdf/ImagesToPdf";
import { MergePdfs } from "./pdf/MergePdfs";
import { PdfToImages } from "./pdf/PdfToImages";
import { ProtectPdf } from "./pdf/ProtectPdf";
import { UnlockPdf } from "./pdf/UnlockPdf";
import { pill } from "./ui";

type Mode = "to-images" | "to-pdf" | "merge" | "compress" | "protect" | "unlock";

const MODES: { id: Mode; label: string }[] = [
  { id: "to-images", label: "PDF to images" },
  { id: "to-pdf", label: "Images to PDF" },
  { id: "merge", label: "Merge" },
  { id: "compress", label: "Compress" },
  { id: "protect", label: "Protect" },
  { id: "unlock", label: "Unlock" },
];

function ModeView({ mode }: { mode: Mode }) {
  if (mode === "to-images") return <PdfToImages />;
  if (mode === "to-pdf") return <ImagesToPdf />;
  if (mode === "merge") return <MergePdfs />;
  if (mode === "compress") return <CompressPdf />;
  if (mode === "protect") return <ProtectPdf />;
  return <UnlockPdf />;
}

export function PdfTool() {
  const [mode, setMode] = useState<Mode>("to-images");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap justify-center gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={pill(mode === m.id)}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ModeView mode={mode} />
    </div>
  );
}
