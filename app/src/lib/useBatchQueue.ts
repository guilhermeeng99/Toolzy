import { useCallback, useState } from "react";
import { baseName, extOf } from "./path";

export type ItemStatus = "pending" | "working" | "done" | "error";

/** One queued file. Tools extend this with their own per-result fields (`T`). */
export interface QueueItem {
  id: string;
  path: string;
  name: string;
  status: ItemStatus;
  error?: string;
}

/** A queue row: the base item plus the (optional, until done) result payload. */
export type QueueRow<T> = QueueItem & Partial<T>;

/**
 * Sequential file-processing queue shared by the batch tools (Image, Media):
 * add + dedupe dropped/picked paths (filtered by `extensions`), then process
 * them one at a time, each carrying its own status. `process` resolves with the
 * per-item result payload (`T`) merged onto the row. One failure doesn't stop the
 * rest. Returns the rows plus the controls the UI wires to its buttons.
 */
export function useBatchQueue<T extends object>(
  extensions: readonly string[],
  process: (item: QueueItem) => Promise<T>,
) {
  const [items, setItems] = useState<QueueRow<T>[]>([]);
  const [running, setRunning] = useState(false);

  const addPaths = useCallback(
    (incoming: string[]) => {
      const accepted = incoming.filter((p) => extensions.includes(extOf(p)));
      if (accepted.length === 0) return;
      setItems((prev) => {
        const known = new Set(prev.map((i) => i.path));
        const next = accepted
          .filter((p) => !known.has(p))
          .map((p): QueueRow<T> => {
            const base: QueueItem = {
              id: crypto.randomUUID(),
              path: p,
              name: baseName(p),
              status: "pending",
            };
            return base as QueueRow<T>;
          });
        return next.length > 0 ? [...prev, ...next] : prev;
      });
    },
    [extensions],
  );

  const setStatus = useCallback((id: string, status: ItemStatus, error?: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status, error } : i)));
  }, []);

  const applyResult = useCallback((id: string, result: T) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? ({ ...i, ...result, status: "done", error: undefined } as QueueRow<T>) : i,
      ),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  // Not memoized: closes over the latest `items` + `process` so each run uses the
  // current options. Same semantics as an inline handler.
  async function run() {
    setRunning(true);
    const queue = items.filter((i) => i.status === "pending" || i.status === "error");
    for (const item of queue) {
      setStatus(item.id, "working");
      try {
        applyResult(item.id, await process(item));
      } catch (e) {
        setStatus(item.id, "error", String(e));
      }
    }
    setRunning(false);
  }

  const pending = items.filter((i) => i.status === "pending" || i.status === "error").length;

  return { items, running, pending, addPaths, run, remove, clear };
}
