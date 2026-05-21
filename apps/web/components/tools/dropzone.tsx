"use client";

import { cn } from "@/lib/cn";
import { useCallback, useRef, useState } from "react";

export function Dropzone({
  accept,
  onFiles,
  label = "Drop files here",
  hint = "or click to choose. Files never leave your device.",
}: {
  accept: string;
  onFiles: (files: File[]) => void;
  label?: string;
  hint?: string;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  return (
    <button
      type="button"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors",
        over
          ? "border-action-blue bg-pale-gray/60"
          : "border-platinum-tint bg-cloud-mist hover:border-steel-gray",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <span className="text-body-lg font-semibold text-midnight-indigo">{label}</span>
      <span className="text-body text-slate-blue">{hint}</span>
    </button>
  );
}
