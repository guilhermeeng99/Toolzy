import { formatBytes } from "../lib/format";
import type { DownloadProgress } from "../lib/media";

/**
 * Determinate progress bar when the total size is known; an indeterminate pulse
 * otherwise (live sources, or a post-processing step that reports no byte total).
 * Shared by the downloader and the transcription model / GPU-engine downloads.
 */
export function DownloadBar({
  label,
  progress,
}: {
  label: string;
  progress: DownloadProgress | null;
}) {
  const known = progress?.total != null && progress.total > 0;
  const pct = known ? Math.min(100, Math.round(progress?.percent ?? 0)) : 0;
  return (
    <div className="rounded-lg bg-action-blue/10 px-4 py-3 text-action-blue">
      <div className="mb-2 flex justify-between text-body-lg font-medium">
        <span>{label}</span>
        <span>
          {progress == null
            ? "Starting…"
            : known
              ? `${pct}% · ${formatBytes(progress.downloaded)} / ${formatBytes(progress.total ?? 0)}`
              : formatBytes(progress.downloaded)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-action-blue/20">
        <div
          className={`h-full rounded-full bg-action-blue transition-all ${known ? "" : "w-1/3 animate-pulse"}`}
          style={known ? { width: `${pct}%` } : undefined}
        />
      </div>
    </div>
  );
}

/** Label + indeterminate pulse, for steps with no byte progress (post-processing). */
export function PulseBanner({ label }: { label: string }) {
  return (
    <div className="rounded-lg bg-action-blue/10 px-4 py-3 text-action-blue">
      <div className="mb-2 text-body-lg font-medium">{label}</div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-action-blue/20">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-action-blue" />
      </div>
    </div>
  );
}
