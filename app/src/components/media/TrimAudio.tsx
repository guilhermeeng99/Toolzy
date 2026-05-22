import { useEffect, useState } from "react";
import { trimAudio } from "../../lib/audioEdit";
import { AUDIO_EXTENSIONS, probeDuration } from "../../lib/media";
import { useFileEdit } from "../../lib/useFileEdit";
import { EditPanel } from "../EditPanel";
import { TimeRange } from "../TimeRange";
import { Field } from "../ui";

const clampTo = (v: number, max: number | null): number =>
  max === null ? Math.max(0, v) : Math.min(Math.max(0, v), max);

/** Keep a `[start, end]` range of an audio file (re-encodes into the same format). */
export function TrimAudio() {
  const { path, over, busy, status, choose, run } = useFileEdit(AUDIO_EXTENSIONS);
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  // Read the picked file's length so the range can default to the whole clip + clamp.
  useEffect(() => {
    if (!path) return;
    setDuration(null);
    setStart(0);
    setEnd(0);
    probeDuration(path)
      .then((d) => {
        setDuration(d);
        setEnd(d);
      })
      .catch(() => {});
  }, [path]);

  const valid = end > start;

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => trimAudio(path, start, end))}
      action="Trim audio"
      verb="Trimming..."
      dropLabel="Drop an audio file here, or click to choose"
      disabled={!valid}
    >
      <Field label="Keep range">
        <TimeRange
          duration={duration}
          start={start}
          end={end}
          onStart={(s) => setStart(clampTo(s, duration))}
          onEnd={(e) => setEnd(clampTo(e, duration))}
        />
      </Field>
    </EditPanel>
  );
}
