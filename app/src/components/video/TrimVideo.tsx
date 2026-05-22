import { useEffect, useState } from "react";
import { probeDuration } from "../../lib/media";
import { useFileEdit } from "../../lib/useFileEdit";
import { VIDEO_EXTENSIONS, trimVideo } from "../../lib/videoEdit";
import { EditPanel } from "../EditPanel";
import { TimeRange } from "../TimeRange";
import { Field } from "../ui";

const clampTo = (v: number, max: number | null): number =>
  max === null ? Math.max(0, v) : Math.min(Math.max(0, v), max);

/** Keep a `[start, end]` range of a video (lossless stream copy). */
export function TrimVideo() {
  const { path, over, busy, status, choose, run } = useFileEdit(VIDEO_EXTENSIONS);
  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

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

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => trimVideo(path, start, end))}
      action="Trim video"
      verb="Trimming..."
      hint="Lossless cut — the start snaps to the nearest keyframe."
      dropLabel="Drop a video here, or click to choose"
      disabled={end <= start}
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
