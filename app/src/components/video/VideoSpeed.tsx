import { useState } from "react";
import { useFileEdit } from "../../lib/useFileEdit";
import { VIDEO_EXTENSIONS, changeVideoSpeed } from "../../lib/videoEdit";
import { EditPanel } from "../EditPanel";
import { Field, Slider } from "../ui";

/** Change a video's playback speed (0.5×–2×); audio is retimed too. */
export function VideoSpeed() {
  const { path, over, busy, status, choose, run } = useFileEdit(VIDEO_EXTENSIONS);
  const [factor, setFactor] = useState(1);

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => changeVideoSpeed(path, factor))}
      action="Apply speed"
      verb="Applying..."
      hint="The video needs an audio track (its audio is retimed to match)."
      dropLabel="Drop a video here, or click to choose"
    >
      <Field label={`Speed — ${factor.toFixed(2)}×`}>
        <Slider min={0.5} max={2} step={0.05} value={factor} onChange={setFactor} />
      </Field>
    </EditPanel>
  );
}
