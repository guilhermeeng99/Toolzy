import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { extOf } from "./path";
import { useFileDrop } from "./useFileDrop";

/**
 * Pick or drop a single file whose extension is in `extensions` (drag-drop routes
 * the first match). Returns the chosen `path`, the drop-hover `over` flag, and a
 * `choose` opener. `onPick` fires on each new pick — use it to clear stale result
 * state (resetting in the handler, not an effect).
 *
 * Pass stable `extensions` / `onPick` references (module const / `useCallback`) so
 * the drop listener isn't re-bound every render.
 */
export function useSingleFile(extensions: readonly string[], onPick?: () => void) {
  const [path, setPath] = useState<string | null>(null);

  const pick = useCallback(
    (p: string) => {
      setPath(p);
      onPick?.();
    },
    [onPick],
  );

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

  return { path, over, choose };
}
