import { useState } from "react";
import { ModeTabs } from "./ui";
import { AddAudio } from "./video/AddAudio";
import { MergeVideos } from "./video/MergeVideos";
import { MirrorVideo } from "./video/MirrorVideo";
import { RotateVideo } from "./video/RotateVideo";
import { TrimVideo } from "./video/TrimVideo";
import { VideoSpeed } from "./video/VideoSpeed";

type Mode = "trim" | "merge" | "add-audio" | "rotate" | "mirror" | "speed";

const MODES: { id: Mode; label: string }[] = [
  { id: "trim", label: "Trim" },
  { id: "merge", label: "Merge" },
  { id: "add-audio", label: "Add audio" },
  { id: "rotate", label: "Rotate" },
  { id: "mirror", label: "Mirror" },
  { id: "speed", label: "Speed" },
];

function ModeView({ mode }: { mode: Mode }) {
  if (mode === "trim") return <TrimVideo />;
  if (mode === "merge") return <MergeVideos />;
  if (mode === "add-audio") return <AddAudio />;
  if (mode === "rotate") return <RotateVideo />;
  if (mode === "mirror") return <MirrorVideo />;
  return <VideoSpeed />;
}

export function VideoTool() {
  const [mode, setMode] = useState<Mode>("trim");
  return (
    <div className="flex flex-col gap-6">
      <ModeTabs modes={MODES} active={mode} onSelect={setMode} />
      <ModeView mode={mode} />
    </div>
  );
}
