import { useEffect, useState } from "react";
import { formatTime, parseTime } from "../lib/time";

/** One time field (accepts M:SS / H:MM:SS / seconds), committing on blur or Enter.
 *  Reformats on commit and resyncs if the parent clamps the value. */
function TimeInput({
  seconds,
  onCommit,
  label,
}: {
  seconds: number;
  onCommit: (s: number) => void;
  label: string;
}) {
  const [text, setText] = useState(formatTime(seconds));
  useEffect(() => setText(formatTime(seconds)), [seconds]);

  function commit() {
    const parsed = parseTime(text);
    if (parsed !== null) onCommit(parsed);
    else setText(formatTime(seconds)); // reject invalid, restore last good
  }

  return (
    <label className="flex flex-col gap-1 text-body font-semibold uppercase tracking-wide text-slate-blue">
      {label}
      <input
        value={text}
        inputMode="numeric"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-28 rounded-lg border border-platinum-tint bg-snow-white px-3 py-1.5 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
      />
    </label>
  );
}

/** Start/end time fields for trim, showing the source duration. The parent owns
 *  `start`/`end` (seconds) and clamps them; this component only edits. */
export function TimeRange({
  duration,
  start,
  end,
  onStart,
  onEnd,
}: {
  duration: number | null;
  start: number;
  end: number;
  onStart: (s: number) => void;
  onEnd: (s: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <TimeInput label="Start" seconds={start} onCommit={onStart} />
      <TimeInput label="End" seconds={end} onCommit={onEnd} />
      {duration !== null ? (
        <span className="pb-2 text-body text-slate-blue">of {formatTime(duration)}</span>
      ) : null}
    </div>
  );
}
