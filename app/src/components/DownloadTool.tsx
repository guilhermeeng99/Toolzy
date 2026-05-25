import { useRef, useState } from "react";
import { formatBytes } from "../lib/format";
import {
  type DownloadFormat,
  type DownloadProgress,
  MP3_BITRATES,
  type MediaProbe,
  type VideoOption,
  downloadMedia,
  mp3SizeEstimate,
  probeMedia,
} from "../lib/media";
import { DownloadBar, PulseBanner } from "./DownloadBar";
import { Card, Field, PrimaryButton, focusRing, pill } from "./ui";

type Tab = "mp4" | "mp3";
type RowResult = { ok: boolean; message: string };
type ResultMap = Record<string, RowResult>;

export function DownloadTool() {
  const [url, setUrl] = useState("");
  const [probe, setProbe] = useState<MediaProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mp4");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [finishing, setFinishing] = useState(false);
  const finishTimer = useRef<number | null>(null);
  const [results, setResults] = useState<ResultMap>({});
  const [lastKey, setLastKey] = useState<string | null>(null);

  const valid = /^https?:\/\//i.test(url.trim());

  async function search() {
    if (!valid) return;
    setProbing(true);
    setError(null);
    setResults({});
    setLastKey(null);
    setProbe(null);
    try {
      const result = await probeMedia(url.trim());
      setProbe(result);
      setTab("mp4");
    } catch (e) {
      setError(String(e));
    }
    setProbing(false);
  }

  async function download(
    key: string,
    format: DownloadFormat,
    opts: { height?: number; audioBitrate?: number },
  ) {
    setBusyKey(key);
    setLastKey(key);
    setProgress(null);
    setFinishing(false);
    setResults((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });

    // yt-dlp emits no progress during ffmpeg post-processing (mp3 transcode /
    // mp4 merge). When the byte stream goes quiet, fall back to a "finishing"
    // state so the last seconds aren't a frozen 100% bar.
    const handleProgress = (p: DownloadProgress) => {
      setProgress(p);
      setFinishing(false);
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
      finishTimer.current = window.setTimeout(() => setFinishing(true), 700);
    };

    try {
      const path = await downloadMedia(url.trim(), format, opts, handleProgress);
      setResults((r) => ({ ...r, [key]: { ok: true, message: `Saved to ${path}` } }));
    } catch (e) {
      setResults((r) => ({ ...r, [key]: { ok: false, message: String(e) } }));
    }
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
    setBusyKey(null);
    setProgress(null);
    setFinishing(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Paste a video or audio link">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              placeholder="https://..."
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="w-full rounded-lg border border-platinum-tint bg-snow-white px-4 py-3 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
            />
            <PrimaryButton onClick={search} disabled={probing || !valid}>
              {probing ? "Reading..." : "Search"}
            </PrimaryButton>
          </div>
        </Field>
      </Card>

      {error ? <p className="text-body-lg text-danger">{error}</p> : null}

      {probe ? (
        <ResultPanel
          probe={probe}
          tab={tab}
          setTab={setTab}
          busyKey={busyKey}
          progress={progress}
          finishing={finishing}
          results={results}
          lastKey={lastKey}
          onDownload={download}
        />
      ) : null}

      <p className="text-body text-slate-blue">
        Runs on your machine and connection. Respect each site's terms — you are responsible for
        what you download.
      </p>
    </div>
  );
}

type DownloadFn = (
  key: string,
  format: DownloadFormat,
  opts: { height?: number; audioBitrate?: number },
) => void;

function ResultPanel({
  probe,
  tab,
  setTab,
  busyKey,
  progress,
  finishing,
  results,
  lastKey,
  onDownload,
}: {
  probe: MediaProbe;
  tab: Tab;
  setTab: (t: Tab) => void;
  busyKey: string | null;
  progress: DownloadProgress | null;
  finishing: boolean;
  results: ResultMap;
  lastKey: string | null;
  onDownload: DownloadFn;
}) {
  // No yt-dlp signal for the post-processing step, so name it from the format.
  const phaseLabel = busyKey?.startsWith("mp3") ? "Converting to MP3…" : "Merging…";
  return (
    <Card>
      <div className="flex items-center gap-4">
        {probe.thumbnail ? (
          <img src={probe.thumbnail} alt="" className="h-20 w-32 rounded-lg object-cover" />
        ) : null}
        <p className="text-body-lg font-semibold text-midnight-indigo">{probe.title}</p>
      </div>

      <StatusBanner
        busy={busyKey !== null}
        progress={progress}
        finishing={finishing}
        phaseLabel={phaseLabel}
        result={lastKey ? (results[lastKey] ?? null) : null}
      />

      <div className="flex gap-2">
        <button type="button" className={pill(tab === "mp4")} onClick={() => setTab("mp4")}>
          Video (MP4)
        </button>
        <button type="button" className={pill(tab === "mp3")} onClick={() => setTab("mp3")}>
          Audio (MP3)
        </button>
      </div>

      {tab === "mp4" ? (
        <VideoTable
          options={probe.video}
          busyKey={busyKey}
          results={results}
          onDownload={onDownload}
        />
      ) : (
        <AudioTable
          duration={probe.duration}
          busyKey={busyKey}
          results={results}
          onDownload={onDownload}
        />
      )}
    </Card>
  );
}

/** Prominent feedback above the table: a live progress bar while downloading,
 * then success/failure of the last download — so the user always sees the
 * outcome without scrolling. */
function StatusBanner({
  busy,
  progress,
  finishing,
  phaseLabel,
  result,
}: {
  busy: boolean;
  progress: DownloadProgress | null;
  finishing: boolean;
  phaseLabel: string;
  result: RowResult | null;
}) {
  if (busy)
    return <ProgressBanner progress={progress} finishing={finishing} phaseLabel={phaseLabel} />;
  if (!result) return null;
  const tone = result.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger";
  return (
    <div className={`rounded-lg px-4 py-3 text-body-lg font-medium break-words ${tone}`}>
      {result.ok ? "✓ " : "✕ "}
      {result.message}
    </div>
  );
}

/** Determinate bar when the total size is known; otherwise an indeterminate
 * pulse (live sources, or the ffmpeg post-processing step that reports no bytes). */
function ProgressBanner({
  progress,
  finishing,
  phaseLabel,
}: {
  progress: DownloadProgress | null;
  finishing: boolean;
  phaseLabel: string;
}) {
  if (finishing) return <PulseBanner label={phaseLabel} />;
  return <DownloadBar label="Downloading…" progress={progress} />;
}

function VideoTable({
  options,
  busyKey,
  results,
  onDownload,
}: {
  options: VideoOption[];
  busyKey: string | null;
  results: ResultMap;
  onDownload: DownloadFn;
}) {
  if (options.length === 0) {
    return <p className="text-body text-slate-blue">No MP4 qualities found for this link.</p>;
  }
  return (
    <QualityTable
      rows={options.map((o) => ({
        key: `mp4-${o.height}`,
        quality: o.label,
        format: "MP4",
        size: o.filesize,
        run: () => onDownload(`mp4-${o.height}`, "mp4", { height: o.height }),
      }))}
      busyKey={busyKey}
      results={results}
    />
  );
}

function AudioTable({
  duration,
  busyKey,
  results,
  onDownload,
}: {
  duration: number | null;
  busyKey: string | null;
  results: ResultMap;
  onDownload: DownloadFn;
}) {
  return (
    <QualityTable
      rows={MP3_BITRATES.map((kbps) => ({
        key: `mp3-${kbps}`,
        quality: `${kbps} kbps`,
        format: "MP3",
        size: mp3SizeEstimate(duration, kbps),
        run: () => onDownload(`mp3-${kbps}`, "mp3", { audioBitrate: kbps }),
      }))}
      busyKey={busyKey}
      results={results}
    />
  );
}

interface QualityRow {
  key: string;
  quality: string;
  format: string;
  size: number | null;
  run: () => void;
}

function QualityTable({
  rows,
  busyKey,
  results,
}: {
  rows: QualityRow[];
  busyKey: string | null;
  results: ResultMap;
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-body font-semibold uppercase tracking-wide text-slate-blue">
          <th className="pb-2">Quality</th>
          <th className="pb-2">Format</th>
          <th className="pb-2">Size</th>
          <th className="pb-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            className="border-t border-platinum-tint text-body-lg text-midnight-indigo"
          >
            <td className="py-3 font-semibold">{row.quality}</td>
            <td className="py-3 text-slate-blue">{row.format}</td>
            <td className="py-3 text-slate-blue">
              {row.size != null ? formatBytes(row.size) : "—"}
            </td>
            <td className="py-3">
              <div className="flex items-center justify-end gap-3">
                <RowOutcome result={results[row.key]} />
                <DownloadButton
                  onClick={row.run}
                  busy={busyKey === row.key}
                  disabled={busyKey !== null}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Per-row marker so the user sees which quality succeeded/failed. */
function RowOutcome({ result }: { result: RowResult | undefined }) {
  if (!result) return null;
  const tone = result.ok ? "text-success" : "text-danger";
  return (
    <span className={`text-body font-semibold ${tone}`}>{result.ok ? "✓ Saved" : "✕ Failed"}</span>
  );
}

function DownloadButton({
  onClick,
  busy,
  disabled,
}: { onClick: () => void; busy: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg bg-action-blue px-4 py-2 text-body font-semibold text-snow-white transition hover:brightness-105 disabled:opacity-50 ${focusRing}`}
    >
      {busy ? "Saving..." : "Download"}
    </button>
  );
}
