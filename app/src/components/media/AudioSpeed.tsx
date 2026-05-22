import { useState } from "react";
import { changeAudioSpeed } from "../../lib/audioEdit";
import { AUDIO_EXTENSIONS } from "../../lib/media";
import { useFileEdit } from "../../lib/useFileEdit";
import { EditPanel } from "../EditPanel";
import { Field, Slider } from "../ui";

/** Change an audio file's speed (0.5×–2×; pitch preserved via atempo). */
export function AudioSpeed() {
  const { path, over, busy, status, choose, run } = useFileEdit(AUDIO_EXTENSIONS);
  const [factor, setFactor] = useState(1);

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => changeAudioSpeed(path, factor))}
      action="Apply speed"
      verb="Applying..."
      dropLabel="Drop an audio file here, or click to choose"
    >
      <Field label={`Speed — ${factor.toFixed(2)}×`}>
        <Slider min={0.5} max={2} step={0.05} value={factor} onChange={setFactor} />
      </Field>
    </EditPanel>
  );
}
