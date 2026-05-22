import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState } from "react";

/**
 * Native OS drag-drop for the active webview. Returns `over` (true while a drag
 * hovers — for the drop-zone highlight) and invokes `onDrop` with the real file
 * paths on drop. Tauri yields real filesystem paths, not browser `File` objects.
 *
 * `onDrop` must be stable (wrap in `useCallback`) so the listener isn't churned.
 */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "over") setOver(true);
      else if (e.payload.type === "drop") {
        setOver(false);
        onDrop(e.payload.paths);
      } else setOver(false);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [onDrop]);
  return over;
}
