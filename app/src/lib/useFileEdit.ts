import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { extOf } from "./path";
import { useFileDrop } from "./useFileDrop";

/**
 * Single-file edit scaffold shared by the audio/video edit modes: pick or drop one
 * file (filtered by `extensions`), then run a command that returns the saved path,
 * surfacing a busy flag and a `Saved:` / `Failed:` status line. Batch stays the
 * Convert mode's job (`useBatchQueue`).
 */
export function useFileEdit(extensions: readonly string[]) {
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const pick = useCallback((p: string) => {
    setPath(p);
    setStatus(null);
  }, []);

  const over = useFileDrop(
    useCallback(
      (incoming: string[]) => {
        const match = incoming.find((p) => extensions.includes(extOf(p)));
        if (match) pick(match);
      },
      [extensions, pick],
    ),
  );

  const choose = useCallback(async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "File", extensions: [...extensions] }],
    });
    if (typeof picked === "string") pick(picked);
  }, [extensions, pick]);

  // Run the command wrapper, turning its result/throw into the status line.
  const run = useCallback(async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(`Saved: ${await fn()}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
    setBusy(false);
  }, []);

  return { path, over, busy, status, choose, run };
}
