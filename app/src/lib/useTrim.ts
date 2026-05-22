import { useEffect, useState } from "react";
import { probeDuration } from "./media";
import { useFileEdit } from "./useFileEdit";

const clampTo = (v: number, max: number | null): number =>
  max === null ? Math.max(0, v) : Math.min(Math.max(0, v), max);

/**
 * Trim scaffold shared by the audio + video Trim modes: the single-file edit state
 * (`useFileEdit`) plus the source duration (probed on pick) and a `[start, end]`
 * range clamped to it. `valid` is the engine's `start < end` precondition.
 */
export function useTrim(extensions: readonly string[]) {
  const edit = useFileEdit(extensions);
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  // Read the picked file's length so the range defaults to the whole clip + clamps.
  useEffect(() => {
    if (!edit.path) return;
    setDuration(null);
    setStart(0);
    setEnd(0);
    probeDuration(edit.path)
      .then((d) => {
        setDuration(d);
        setEnd(d);
      })
      .catch(() => {});
  }, [edit.path]);

  return {
    ...edit,
    duration,
    start,
    end,
    setStart: (s: number) => setStart(clampTo(s, duration)),
    setEnd: (e: number) => setEnd(clampTo(e, duration)),
    valid: end > start,
  };
}
