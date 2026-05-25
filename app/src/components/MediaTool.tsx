import { useState } from "react";
import { TranscribeTool } from "./TranscribeTool";
import { AudioSpeed } from "./media/AudioSpeed";
import { AudioVolume } from "./media/AudioVolume";
import { ConvertAudio } from "./media/ConvertAudio";
import { TrimAudio } from "./media/TrimAudio";
import { ModeTabs } from "./ui";

type Mode = "convert" | "trim" | "volume" | "speed" | "transcribe";

const MODES: { id: Mode; label: string }[] = [
  { id: "convert", label: "Convert" },
  { id: "trim", label: "Trim" },
  { id: "volume", label: "Volume" },
  { id: "speed", label: "Speed" },
  { id: "transcribe", label: "Transcribe" },
];

function ModeView({ mode }: { mode: Mode }) {
  if (mode === "convert") return <ConvertAudio />;
  if (mode === "trim") return <TrimAudio />;
  if (mode === "volume") return <AudioVolume />;
  if (mode === "speed") return <AudioSpeed />;
  return <TranscribeTool />;
}

export function MediaTool() {
  const [mode, setMode] = useState<Mode>("convert");
  return (
    <div className="flex flex-col gap-6">
      <ModeTabs modes={MODES} active={mode} onSelect={setMode} />
      <ModeView mode={mode} />
    </div>
  );
}
