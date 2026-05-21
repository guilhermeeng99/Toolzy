"use client";

import { Field, Segmented } from "@/components/tools/controls";
import { Dropzone } from "@/components/tools/dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { triggerDownload } from "@/lib/download";
import { imagesToPdf } from "@/lib/pdf/build";
import {
  type ImagesToPdfOptions,
  type PdfPageSize,
  type ToolzyError,
  describeError,
} from "@toolzy/engine";
import { useState } from "react";

interface Item {
  id: string;
  file: File;
  thumbUrl: string;
}

export function ImagesToPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [pageSize, setPageSize] = useState<PdfPageSize>("fit");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<ToolzyError | null>(null);

  function addFiles(files: File[]) {
    const next: Item[] = files
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ id: crypto.randomUUID(), file: f, thumbUrl: URL.createObjectURL(f) }));
    if (next.length > 0) setItems((prev) => [...prev, ...next]);
  }

  function move(id: string, dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const moved = copy[idx];
      if (!moved) return prev;
      copy.splice(idx, 1);
      copy.splice(j, 0, moved);
      return copy;
    });
  }

  function remove(id: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) URL.revokeObjectURL(it.thumbUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  async function create() {
    if (items.length === 0) return;
    setWorking(true);
    setError(null);
    const options: ImagesToPdfOptions = { pageSize };
    const res = await imagesToPdf(
      items.map((i) => i.file),
      options,
    );
    setWorking(false);
    if (res.ok) triggerDownload(res.value.blob, res.value.filename);
    else setError(res.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <Field label="Page size">
          <Segmented
            options={["fit", "a4", "letter"] as const}
            value={pageSize}
            onChange={setPageSize}
            labels={{ fit: "Fit image", a4: "A4", letter: "Letter" }}
          />
        </Field>
      </Card>

      <Dropzone accept="image/*" onFiles={addFiles} />

      {items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item, index) => (
              <Card key={item.id} className="flex items-center gap-4 p-3">
                <span className="w-6 shrink-0 text-center text-body font-semibold text-slate-blue">
                  {index + 1}
                </span>
                <img
                  src={item.thumbUrl}
                  alt={item.file.name}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-body-lg font-semibold text-midnight-indigo">
                  {item.file.name}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn label="Move up" onClick={() => move(item.id, -1)} disabled={index === 0}>
                    ↑
                  </IconBtn>
                  <IconBtn
                    label="Move down"
                    onClick={() => move(item.id, 1)}
                    disabled={index === items.length - 1}
                  >
                    ↓
                  </IconBtn>
                  <IconBtn label={`Remove ${item.file.name}`} onClick={() => remove(item.id)}>
                    x
                  </IconBtn>
                </div>
              </Card>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <Button onClick={create} disabled={working}>
              {working ? "Creating PDF..." : "Create PDF"}
            </Button>
          </div>
        </>
      ) : null}

      {error ? <p className="text-body-lg text-midnight-indigo">{describeError(error)}</p> : null}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-midnight-indigo transition-colors hover:bg-pale-gray disabled:opacity-30"
    >
      {children}
    </button>
  );
}
