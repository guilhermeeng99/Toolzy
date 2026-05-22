import { useCallback, useRef, useState } from "react";
import { type Rotation, makeThumbnail } from "./pdf";

export interface PdfItem {
  path: string;
  rotation: Rotation;
}

/** Shared state for the grid pickers (images→PDF, merge): an ordered list of files
 *  plus their preview thumbnails, with add/remove/reorder/rotate/sort. Thumbnails
 *  are fetched once per path (native `make_thumbnail`) and cached. */
export function usePdfItems() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requested = useRef<Set<string>>(new Set());

  const addPaths = useCallback((incoming: string[]) => {
    setItems((prev) => {
      const have = new Set(prev.map((i) => i.path));
      const fresh = incoming
        .filter((p) => !have.has(p))
        .map((p) => ({ path: p, rotation: 0 as Rotation }));
      return [...prev, ...fresh];
    });
    for (const p of incoming) {
      if (requested.current.has(p)) continue;
      requested.current.add(p);
      makeThumbnail(p)
        .then((t) => setThumbs((m) => ({ ...m, [p]: t })))
        .catch(() => requested.current.delete(p));
    }
  }, []);

  const remove = useCallback((path: string) => {
    setItems((prev) => prev.filter((i) => i.path !== path));
  }, []);

  const reorder = useCallback((paths: string[]) => {
    setItems((prev) =>
      paths.map((p) => prev.find((i) => i.path === p)).filter((i): i is PdfItem => i !== undefined),
    );
  }, []);

  const rotate = useCallback((path: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.path === path ? { ...i, rotation: ((i.rotation + 90) % 360) as Rotation } : i,
      ),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, thumbs, addPaths, remove, reorder, rotate, clear };
}
