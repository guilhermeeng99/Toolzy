import { useEffect, useState } from "react";

/**
 * Seconds elapsed while `active` is true — the liveness signal for long edits that
 * emit no streamed progress (ffmpeg compress, short-clip Whisper). Resets to 0 when
 * `active` flips true and stops on cleanup.
 */
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return elapsed;
}
