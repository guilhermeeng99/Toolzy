import { useCallback, useState } from "react";

/**
 * Run one async action with a busy flag and a typed result/error channel — the shared
 * lifecycle for single-file tools that return a typed value (a `CompressResult`, a page
 * list) rather than EditPanel's `Saved:`/`Failed:` status string. `run` clears the
 * previous result/error, awaits `fn`, then stores its value or the stringified error;
 * `reset` clears both (e.g. when a new file is picked).
 */
export function useAsyncAction<R>() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  const run = useCallback(async (fn: () => Promise<R>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }, []);

  return { busy, result, error, run, reset };
}
