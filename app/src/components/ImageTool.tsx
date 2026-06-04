import { useState } from "react";
import {
  IMAGE_EXTENSIONS,
  IMAGE_TARGETS,
  type ImageTarget,
  QUALITY_TARGETS,
  type ResizeMode,
  type ResizeOpt,
  convertImage,
} from "../lib/convert";
import { formatBytes, sizeDelta } from "../lib/format";
import { useBatchQueue } from "../lib/useBatchQueue";
import { useFileDrop } from "../lib/useFileDrop";
import { useMultiFile } from "../lib/useMultiFile";
import { BatchPanel } from "./BatchPanel";
import { Card, Field, NumberInput, Slider, pill } from "./ui";

const MODES: ResizeMode[] = ["none", "percent", "px"];

type ImageResult = { inBytes: number; outBytes: number };

export function ImageTool() {
  const [target, setTarget] = useState<ImageTarget>("webp");
  const [quality, setQuality] = useState(80);
  const [mode, setMode] = useState<ResizeMode>("none");
  const [percent, setPercent] = useState(100);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);

  function buildResize(): ResizeOpt | undefined {
    if (mode === "none") return undefined;
    return {
      mode,
      keepAspectRatio: keepAspect,
      percent: mode === "percent" ? percent : undefined,
      width: mode === "px" && width !== "" ? Number(width) : undefined,
      height: mode === "px" && height !== "" ? Number(height) : undefined,
    };
  }

  const { items, running, pending, addPaths, run, remove, clear } = useBatchQueue<ImageResult>(
    IMAGE_EXTENSIONS,
    (item) => {
      const q = QUALITY_TARGETS.has(target) ? quality : undefined;
      return convertImage({ path: item.path, target, quality: q, resize: buildResize() });
    },
  );

  const over = useFileDrop(addPaths);
  const choose = useMultiFile(IMAGE_EXTENSIONS, addPaths, "Images");

  const isLossy = QUALITY_TARGETS.has(target);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Convert to">
          <div className="flex flex-wrap gap-2">
            {IMAGE_TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={pill(target === t)}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        {isLossy ? (
          <Field label={`Quality: ${quality}`}>
            <Slider min={1} max={100} value={quality} onChange={setQuality} />
          </Field>
        ) : null}

        <Field label="Resize">
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={pill(mode === m)}>
                {m === "none" ? "original" : m}
              </button>
            ))}
          </div>

          {mode === "percent" ? (
            <div className="mt-3 flex items-center gap-3">
              <Slider min={1} max={100} value={percent} onChange={setPercent} width="12rem" />
              <span className="text-body-lg text-midnight-indigo">{percent}%</span>
            </div>
          ) : null}

          {mode === "px" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <NumberInput value={width} onChange={setWidth} placeholder="Width" />
              <span className="text-slate-blue">x</span>
              <NumberInput value={height} onChange={setHeight} placeholder="Height" />
              <label className="flex items-center gap-2 text-body text-slate-blue">
                <input
                  type="checkbox"
                  checked={keepAspect}
                  onChange={(e) => setKeepAspect(e.target.checked)}
                  className="accent-action-blue"
                />
                Keep aspect ratio
              </label>
            </div>
          ) : null}
        </Field>
      </Card>

      <BatchPanel<ImageResult>
        items={items}
        running={running}
        pending={pending}
        over={over}
        choose={choose}
        run={run}
        clear={clear}
        onRemove={remove}
        action="Convert"
        verb="Converting..."
        dropLabel="Drop images here, or click to choose"
        dropHint="PNG · JPG · WebP · GIF · BMP · TIFF · HEIC — processed natively on your device"
        renderDetail={(item) =>
          item.status === "done" && item.inBytes != null && item.outBytes != null ? (
            <>
              {formatBytes(item.inBytes)} {"->"} {formatBytes(item.outBytes)}{" "}
              <span className="font-semibold text-action-blue">
                {sizeDelta(item.inBytes, item.outBytes)}
              </span>
            </>
          ) : item.status === "error" ? (
            <span className="text-midnight-indigo">{item.error}</span>
          ) : (
            item.path
          )
        }
      />
    </div>
  );
}
