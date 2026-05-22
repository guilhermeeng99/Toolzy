import { trimAudio } from "../../lib/audioEdit";
import { AUDIO_EXTENSIONS } from "../../lib/media";
import { useTrim } from "../../lib/useTrim";
import { EditPanel } from "../EditPanel";
import { TimeRange } from "../TimeRange";
import { Field } from "../ui";

/** Keep a `[start, end]` range of an audio file (re-encodes into the same format). */
export function TrimAudio() {
  const { path, over, busy, status, choose, run, duration, start, end, setStart, setEnd, valid } =
    useTrim(AUDIO_EXTENSIONS);

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
        <TimeRange duration={duration} start={start} end={end} onStart={setStart} onEnd={setEnd} />
      </Field>
    </EditPanel>
  );
}
