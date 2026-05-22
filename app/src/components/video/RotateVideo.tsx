import { useState } from "react";
import { useFileEdit } from "../../lib/useFileEdit";
import { VIDEO_EXTENSIONS, rotateVideo } from "../../lib/videoEdit";
import { EditPanel } from "../EditPanel";
import { Field, pill } from "../ui";

const ANGLES = [90, 180, 270];

/** Rotate a video clockwise by 90/180/270 degrees. */
export function RotateVideo() {
  const { path, over, busy, status, choose, run } = useFileEdit(VIDEO_EXTENSIONS);
  const [degrees, setDegrees] = useState(90);

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => rotateVideo(path, degrees))}
      action="Rotate video"
      verb="Rotating..."
      dropLabel="Drop a video here, or click to choose"
    >
      <Field label="Rotate clockwise">
        <div className="flex gap-2">
          {ANGLES.map((d) => (
            <button
              key={d}
              type="button"
              className={pill(degrees === d)}
              onClick={() => setDegrees(d)}
            >
              {d}°
            </button>
          ))}
        </div>
      </Field>
    </EditPanel>
  );
}
