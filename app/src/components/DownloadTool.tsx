import { useEffect, useRef, useState } from "react";
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
import { formatTime } from "../lib/time";
import { type LinkTranscribeResult, type WhisperModel, transcribeLink } from "../lib/transcribe";
import { useElapsedSeconds } from "../lib/useElapsedSeconds";
import { useGpuEngine } from "../lib/useGpuEngine";
import { useWhisperModels } from "../lib/useWhisperModels";
import { DownloadBar, PulseBanner } from "./DownloadBar";
import { Card, Field, ModeTabs, PrimaryButton, Select, Spinner, focusRing, pill } from "./ui";

type Tab = "mp4" | "mp3";
type DownloadMode = "download" | "transcribe";
type LinkStage = "download" | "transcribe";
type RowResult = { ok: boolean; message: string };
type ResultMap = Record<string, RowResult>;

const DOWNLOAD_MODES = [
  { id: "download", label: "Download" },
  { id: "transcribe", label: "Transcribe link" },
] as const;

const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "pt", label: "Portuguese" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
] as const;

const LINK_TRANSCRIBE_PREF_VERSION = "2";
const LINK_TRANSCRIBE_PREF_VERSION_KEY = "toolzy.linkTranscribe.prefVersion";
const LINK_TRANSCRIBE_LANGUAGE_KEY = "toolzy.linkTranscribe.lang";

const modelSize = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

function initialLinkTranscribePreference(key: string) {
  if (localStorage.getItem(LINK_TRANSCRIBE_PREF_VERSION_KEY) !== LINK_TRANSCRIBE_PREF_VERSION) {
    return "auto";
  }
  return localStorage.getItem(key) ?? "auto";
}

export function DownloadTool() {
  const [mode, setMode] = useState<DownloadMode>("download");
  return (
    <div className="flex flex-col gap-6">
      <ModeTabs modes={DOWNLOAD_MODES} active={mode} onSelect={setMode} />
      {mode === "download" ? <MediaDownloadPanel /> : <LinkTranscribePanel />}
    </div>
  );
}

function MediaDownloadPanel() {
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

function LinkTranscribePanel() {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState(() =>
    initialLinkTranscribePreference(LINK_TRANSCRIBE_LANGUAGE_KEY),
  );
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<LinkStage>("download");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [transcribeProgress, setTranscribeProgress] = useState<number | null>(null);
  const [result, setResult] = useState<LinkTranscribeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { models, modelId, setModelId, selected, needsDownload, downloading, progress, download } =
    useWhisperModels(setError);
  const gpu = useGpuEngine(setError);
  const elapsed = useElapsedSeconds(busy);
  const valid = /^https?:\/\//i.test(url.trim());

  useEffect(() => {
    localStorage.setItem(LINK_TRANSCRIBE_PREF_VERSION_KEY, LINK_TRANSCRIBE_PREF_VERSION);
  }, []);

  useEffect(() => {
    localStorage.setItem(LINK_TRANSCRIBE_LANGUAGE_KEY, language);
  }, [language]);

  async function run() {
    if (!valid || !selected) return;
    setBusy(true);
    setStage("download");
    setError(null);
    setResult(null);
    setDownloadProgress(null);
    setTranscribeProgress(null);
    try {
      const output = await transcribeLink(
        url.trim(),
        modelId,
        {
          language: language === "auto" ? undefined : language,
        },
        (p) => {
          setDownloadProgress(p);
          if (p.total != null && p.total > 0 && p.percent >= 99) {
            setStage("transcribe");
          }
        },
        (p) => {
          setStage("transcribe");
          setTranscribeProgress(p.percent);
        },
      );
      setResult(output);
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
    setDownloadProgress(null);
    setTranscribeProgress(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="YouTube or media link">
          <input
            type="url"
            value={url}
            placeholder="https://..."
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            className="w-full rounded-lg border border-platinum-tint bg-snow-white px-4 py-3 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
          />
        </Field>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Model">
            <Select value={modelId} onChange={setModelId}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} - {modelSize(m.sizeMb)}
                  {m.downloaded ? "" : " - not installed"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language">
            <Select value={language} onChange={setLanguage}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <LinkGpuRow
          status={gpu.status}
          downloading={gpu.downloading}
          progress={gpu.progress}
          onDownload={gpu.download}
        />

        {needsDownload ? (
          <LinkModelGate
            model={selected}
            downloading={downloading}
            progress={progress}
            onDownload={download}
          />
        ) : busy ? (
          <LinkTranscribeBusy
            stage={stage}
            downloadProgress={downloadProgress}
            transcribeProgress={transcribeProgress}
            elapsed={elapsed}
          />
        ) : (
          <PrimaryButton onClick={run} disabled={!valid || !selected}>
            Transcribe link
          </PrimaryButton>
        )}
      </Card>

      {error ? <p className="break-words text-body-lg text-danger">{error}</p> : null}
      {result ? <LinkResultPanel result={result} /> : null}
    </div>
  );
}

function LinkTranscribeBusy({
  stage,
  downloadProgress,
  transcribeProgress,
  elapsed,
}: {
  stage: LinkStage;
  downloadProgress: DownloadProgress | null;
  transcribeProgress: number | null;
  elapsed: number;
}) {
  if (stage === "download") {
    return <DownloadBar label="Downloading audio..." progress={downloadProgress} />;
  }
  return (
    <LinkPercentProgress label="Transcribing..." percent={transcribeProgress} elapsed={elapsed} />
  );
}

function LinkPercentProgress({
  label,
  percent,
  elapsed,
}: {
  label: string;
  percent: number | null;
  elapsed: number;
}) {
  const determinate = percent != null && percent > 0 && percent < 100;
  const pct = determinate ? Math.round(percent) : 0;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-action-blue/10 px-4 py-3 text-action-blue">
      <Spinner />
      <div className="flex-1">
        <div className="mb-2 flex justify-between text-body-lg font-medium">
          <span>{label}</span>
          <span>{determinate ? `${pct}%` : formatTime(elapsed)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-action-blue/20">
          {determinate ? (
            <div
              className="h-full rounded-full bg-action-blue transition-all"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="toolzy-indeterminate h-full w-1/3 rounded-full bg-action-blue" />
          )}
        </div>
      </div>
    </div>
  );
}

function LinkModelGate({
  model,
  downloading,
  progress,
  onDownload,
}: {
  model: WhisperModel | undefined;
  downloading: boolean;
  progress: DownloadProgress | null;
  onDownload: () => void;
}) {
  if (downloading)
    return <DownloadBar label={`Downloading ${model?.label}...`} progress={progress} />;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-pale-gray px-4 py-4">
      <p className="text-body-lg text-midnight-indigo">
        This needs the <strong>{model?.label}</strong> model ({modelSize(model?.sizeMb ?? 0)}).
      </p>
      <PrimaryButton onClick={onDownload}>Download model</PrimaryButton>
    </div>
  );
}

function LinkGpuRow({
  status,
  downloading,
  progress,
  onDownload,
}: {
  status: { gpuPresent: boolean; downloaded: boolean } | null;
  downloading: boolean;
  progress: DownloadProgress | null;
  onDownload: () => void;
}) {
  if (!status?.gpuPresent) return null;
  if (downloading) return <DownloadBar label="Downloading GPU engine..." progress={progress} />;
  if (status.downloaded) {
    return <p className="text-body font-semibold text-success">GPU acceleration on (NVIDIA)</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-pale-gray px-4 py-3">
      <p className="text-body text-midnight-indigo">
        NVIDIA GPU detected. Enable GPU acceleration for faster transcription.
      </p>
      <button
        type="button"
        onClick={onDownload}
        className={`self-start rounded-lg bg-action-blue px-4 py-2 text-body font-semibold text-snow-white transition hover:brightness-105 ${focusRing}`}
      >
        Enable GPU
      </button>
    </div>
  );
}

function LinkResultPanel({ result }: { result: LinkTranscribeResult }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-body font-semibold uppercase tracking-wide text-slate-blue">
            {result.title} - {result.language}
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className={`text-body font-semibold text-action-blue hover:brightness-110 ${focusRing}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-cloud-mist p-4 text-body-lg text-midnight-indigo">
        {result.text || "(empty - no speech detected)"}
      </pre>
      <p className="break-words text-body text-slate-blue">Saved: {result.outputPath}</p>
    </Card>
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
