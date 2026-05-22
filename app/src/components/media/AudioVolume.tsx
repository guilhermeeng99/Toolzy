import { useState } from "react";
import { changeAudioVolume } from "../../lib/audioEdit";
import { AUDIO_EXTENSIONS } from "../../lib/media";
import { useFileEdit } from "../../lib/useFileEdit";
import { EditPanel } from "../EditPanel";
import { Field, Slider } from "../ui";

/** Scale an audio file's volume (0% mute → 400%; 100% unchanged). */
export function AudioVolume() {
  const { path, over, busy, status, choose, run } = useFileEdit(AUDIO_EXTENSIONS);
  const [percent, setPercent] = useState(100);

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => changeAudioVolume(path, percent))}
      action="Apply volume"
      verb="Applying..."
      dropLabel="Drop an audio file here, or click to choose"
    >
      <Field label={`Volume — ${percent}%`}>
        <Slider min={0} max={400} step={5} value={percent} onChange={setPercent} />
      </Field>
    </EditPanel>
  );
}
