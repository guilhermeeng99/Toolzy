import { useState } from "react";
import { AUDIO_TARGETS, type AudioTarget, MEDIA_EXTENSIONS, convertMedia } from "../../lib/media";
import { useBatchQueue } from "../../lib/useBatchQueue";
import { useFileDrop } from "../../lib/useFileDrop";
import { useMultiFile } from "../../lib/useMultiFile";
import { BatchPanel } from "../BatchPanel";
import { Card, Field, pill } from "../ui";

type MediaResult = { out: string };

/** Convert/extract audio to mp3/m4a/wav (batch). The Media tab's default mode. */
export function ConvertAudio() {
  const [target, setTarget] = useState<AudioTarget>("mp3");

  const { items, running, pending, addPaths, run, clear } = useBatchQueue<MediaResult>(
    MEDIA_EXTENSIONS,
    async (item) => ({ out: await convertMedia(item.path, target) }),
  );

  const over = useFileDrop(addPaths);
  const choose = useMultiFile(MEDIA_EXTENSIONS, addPaths, "Media");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Convert to audio">
          <div className="flex gap-2">
            {AUDIO_TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                className={pill(target === t)}
                onClick={() => setTarget(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <BatchPanel<MediaResult>
        items={items}
        running={running}
        pending={pending}
        over={over}
        choose={choose}
        run={run}
        clear={clear}
        action="Convert"
        verb="Converting..."
        dropLabel="Drop audio/video here, or click to choose"
        dropHint="Converted natively with ffmpeg, on your device"
        renderDetail={(item) =>
          item.status === "done" ? item.out : item.status === "error" ? item.error : item.path
        }
      />
    </div>
  );
}
