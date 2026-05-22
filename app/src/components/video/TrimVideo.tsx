import { useTrim } from "../../lib/useTrim";
import { VIDEO_EXTENSIONS, trimVideo } from "../../lib/videoEdit";
import { EditPanel } from "../EditPanel";
import { TimeRange } from "../TimeRange";
import { Field } from "../ui";

/** Keep a `[start, end]` range of a video (lossless stream copy). */
export function TrimVideo() {
  const { path, over, busy, status, choose, run, duration, start, end, setStart, setEnd, valid } =
    useTrim(VIDEO_EXTENSIONS);

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
      disabled={!valid}
    >
      <Field label="Keep range">
        <TimeRange duration={duration} start={start} end={end} onStart={setStart} onEnd={setEnd} />
      </Field>
    </EditPanel>
  );
}
