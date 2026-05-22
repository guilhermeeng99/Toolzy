import { useState } from "react";
import { useFileEdit } from "../../lib/useFileEdit";
import { VIDEO_EXTENSIONS, mirrorVideo } from "../../lib/videoEdit";
import { EditPanel } from "../EditPanel";
import { Field, pill } from "../ui";

type Direction = "horizontal" | "vertical";

/** Flip a video horizontally or vertically. */
export function MirrorVideo() {
  const { path, over, busy, status, choose, run } = useFileEdit(VIDEO_EXTENSIONS);
  const [direction, setDirection] = useState<Direction>("horizontal");

  return (
    <EditPanel
      path={path}
      over={over}
      busy={busy}
      status={status}
      choose={choose}
      onRun={() => path && run(() => mirrorVideo(path, direction))}
      action="Mirror video"
      verb="Mirroring..."
      dropLabel="Drop a video here, or click to choose"
    >
      <Field label="Flip">
        <div className="flex gap-2">
          <button
            type="button"
            className={pill(direction === "horizontal")}
            onClick={() => setDirection("horizontal")}
          >
            Horizontal
          </button>
          <button
            type="button"
            className={pill(direction === "vertical")}
            onClick={() => setDirection("vertical")}
          >
            Vertical
          </button>
        </div>
      </Field>
    </EditPanel>
  );
}
