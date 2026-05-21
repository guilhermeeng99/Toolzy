/** Trigger a browser download for a blob. */
export function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** De-duplicate a filename within a set, e.g. "a.png" -> "a (1).png". */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let n = 1;
  let candidate = `${base} (${n})${ext}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base} (${n})${ext}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Zip blobs (deduping names) and download the archive. */
export async function downloadZip(
  files: Array<{ name: string; blob: Blob }>,
  zipName: string,
): Promise<void> {
  const taken = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    entries[uniqueName(f.name, taken)] = new Uint8Array(await f.blob.arrayBuffer());
  }
  const { zipSync } = await import("fflate");
  triggerDownload(new Blob([zipSync(entries) as BlobPart], { type: "application/zip" }), zipName);
}
