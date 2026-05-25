import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";

/**
 * Open a native multi-select dialog filtered to `extensions` and forward the chosen
 * paths to `add` (normalizing the dialog's single-string vs string[] result). The
 * batch/list counterpart to `useSingleFile`. Pass a stable `add` (`useCallback`) and
 * a module-const `extensions` so the returned `choose` stays stable.
 */
export function useMultiFile(
  extensions: readonly string[],
  add: (paths: string[]) => void,
  name = "File",
) {
  return useCallback(async () => {
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name, extensions: [...extensions] }],
    });
    if (Array.isArray(picked)) add(picked);
    else if (typeof picked === "string") add([picked]);
  }, [extensions, add, name]);
}
