import { useCallback, useState } from "react";
import { useSingleFile } from "./useSingleFile";

/**
 * Single-file edit scaffold shared by the audio/video edit modes: pick or drop one
 * file (filtered by `extensions`), then run a command that returns the saved path,
 * surfacing a busy flag and a `Saved:` / `Failed:` status line. Batch stays the
 * Convert mode's job (`useBatchQueue`).
 */
export function useFileEdit(extensions: readonly string[]) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Clear the last result when a new file is picked.
  const { path, over, choose } = useSingleFile(
    extensions,
    useCallback(() => setStatus(null), []),
  );

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
