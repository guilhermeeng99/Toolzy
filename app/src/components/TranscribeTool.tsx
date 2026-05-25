import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "../lib/format";
import type { DownloadProgress } from "../lib/media";
import {
  type GpuStatus,
  TRANSCRIBE_EXTENSIONS,
  TRANSCRIBE_FORMATS,
  type TranscribeFormat,
  type TranscribeResult,
  type WhisperModel,
  cancelTranscription,
  downloadGpuEngine,
  downloadWhisperModel,
  gpuEngineStatus,
  listWhisperModels,
  transcribeAudio,
} from "../lib/transcribe";
import { useSingleFile } from "../lib/useSingleFile";
import { Card, Field, PrimaryButton, dropzoneClass, focusRing } from "./ui";

/** A small, common subset; "auto" covers Whisper's other ~90 languages. */
const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "pt", label: "Portuguese" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
] as const;

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const modelSize = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function TranscribeTool() {
  const [result, setResult] = useState<TranscribeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onPick = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);
  const { path, over, choose } = useSingleFile(TRANSCRIBE_EXTENSIONS, onPick);

  const [models, setModels] = useState<WhisperModel[]>([]);
  // Remembered across sessions; language defaults to Portuguese (faster than Auto).
  const [modelId, setModelId] = useState(
    () => localStorage.getItem("toolzy.transcribe.model") ?? "large-v3",
  );
  const [language, setLanguage] = useState(
    () => localStorage.getItem("toolzy.transcribe.lang") ?? "pt",
  );
  const [format, setFormat] = useState<TranscribeFormat>("txt");
  const cancelledRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [tProgress, setTProgress] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const [gpu, setGpu] = useState<GpuStatus | null>(null);
  const [gpuDownloading, setGpuDownloading] = useState(false);
  const [gpuProgress, setGpuProgress] = useState<DownloadProgress | null>(null);

  const reloadModels = useCallback(() => {
    listWhisperModels()
      .then(setModels)
      .catch(() => {});
  }, []);
  useEffect(reloadModels, []);

  const reloadGpu = useCallback(() => {
    gpuEngineStatus()
      .then(setGpu)
      .catch(() => {});
  }, []);
  useEffect(reloadGpu, []);

  // Tick a visible elapsed timer while transcribing — short clips emit no granular
  // % from whisper-cli, so the timer is the main "it's alive" signal.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  useEffect(() => {
    localStorage.setItem("toolzy.transcribe.model", modelId);
  }, [modelId]);
  useEffect(() => {
    localStorage.setItem("toolzy.transcribe.lang", language);
  }, [language]);

  const selected = models.find((m) => m.id === modelId);
  const needsDownload = !!selected && !selected.downloaded;

  async function download() {
    setDownloading(true);
    setProgress(null);
    setError(null);
    try {
      await downloadWhisperModel(modelId, setProgress);
      reloadModels();
    } catch (e) {
      setError(String(e));
    }
    setDownloading(false);
    setProgress(null);
  }

  async function run() {
    if (!path) return;
    cancelledRef.current = false;
    setBusy(true);
    setError(null);
    setResult(null);
    setTProgress(null);
    try {
      const r = await transcribeAudio(
        path,
        modelId,
        { language: language === "auto" ? undefined : language, format },
        (p) => setTProgress(p.percent),
      );
      setResult(r);
    } catch (e) {
      if (!cancelledRef.current) setError(String(e));
    }
    setBusy(false);
    setTProgress(null);
  }

  async function cancel() {
    cancelledRef.current = true;
    try {
      await cancelTranscription();
    } catch {}
  }

  async function downloadGpu() {
    setGpuDownloading(true);
    setGpuProgress(null);
    setError(null);
    try {
      await downloadGpuEngine(setGpuProgress);
      reloadGpu();
    } catch (e) {
      setError(String(e));
    }
    setGpuDownloading(false);
    setGpuProgress(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <button type="button" onClick={choose} className={dropzoneClass(over)}>
          {path ? (
            <>
              <span className="text-body-lg font-semibold text-midnight-indigo">
                {baseName(path)}
              </span>
              <span className="text-body text-slate-blue">Click to change</span>
            </>
          ) : (
            <span className="text-body-lg text-slate-blue">
              Drop an audio or video file here, or click to choose
            </span>
          )}
        </button>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Model">
            <Select value={modelId} onChange={setModelId}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {modelSize(m.sizeMb)}
                  {m.downloaded ? "" : " · not installed"}
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
          <Field label="Output">
            <Select value={format} onChange={(v) => setFormat(v as TranscribeFormat)}>
              {TRANSCRIBE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <GpuRow
          status={gpu}
          downloading={gpuDownloading}
          progress={gpuProgress}
          onDownload={downloadGpu}
        />

        {language === "auto" && !busy ? (
          <p className="text-body text-slate-blue">
            Tip: choose the spoken language instead of Auto-detect — it skips a detection pass and
            is noticeably faster.
          </p>
        ) : null}

        {needsDownload ? (
          <ModelGate
            model={selected}
            downloading={downloading}
            progress={progress}
            onDownload={download}
          />
        ) : busy ? (
          <div className="flex flex-col gap-3">
            <BusyBanner
              label={`Transcribing with ${selected?.label ?? "Whisper"}…`}
              percent={tProgress}
              elapsed={elapsed}
            />
            <button
              type="button"
              onClick={cancel}
              className={`self-start rounded-lg bg-pale-gray px-4 py-2 text-body font-semibold text-midnight-indigo transition hover:bg-platinum-tint ${focusRing}`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <PrimaryButton onClick={run} disabled={!path || !selected}>
            Transcribe
          </PrimaryButton>
        )}

        {busy ? (
          <p className="text-body text-slate-blue">
            Runs on CPU (no GPU yet), so a short clip can take a minute or two with Large v3 — the
            timer shows it's working. Nothing leaves your machine.
          </p>
        ) : null}
      </Card>

      {error ? <p className="break-words text-body-lg text-danger">{error}</p> : null}
      {result ? <ResultPanel result={result} /> : null}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-platinum-tint bg-snow-white px-3 py-2 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
    >
      {children}
    </select>
  );
}

/** "Working" indicator. whisper-cli reports a usable % only for long audio (short
 * clips run as one chunk → 100% only at the end), so the primary signal is a moving
 * spinner + a sliding indeterminate bar + an elapsed timer. When a real sub-100% does
 * arrive (long files), the bar switches to determinate. */
function BusyBanner({
  label,
  percent,
  elapsed,
}: { label: string; percent: number | null; elapsed: number }) {
  const determinate = percent != null && percent > 0 && percent < 100;
  const pct = determinate ? Math.round(percent) : 0;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-action-blue/10 px-4 py-3 text-action-blue">
      <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-action-blue/30 border-t-action-blue" />
      <div className="flex-1">
        <div className="mb-2 flex justify-between text-body-lg font-medium">
          <span>{label}</span>
          <span>{determinate ? `${pct}%` : fmtTime(elapsed)}</span>
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

/** Shared determinate/indeterminate download bar (model + GPU engine). */
function DownloadBar({ label, progress }: { label: string; progress: DownloadProgress | null }) {
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

/** The model download gate: makes it obvious a one-time model download is required,
 * then shows a live progress bar and installs automatically. */
function ModelGate({
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
    return <DownloadBar label={`Downloading ${model?.label}…`} progress={progress} />;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-pale-gray px-4 py-4">
      <p className="text-body-lg text-midnight-indigo">
        This feature needs the <strong>{model?.label}</strong> model (
        {modelSize(model?.sizeMb ?? 0)}
        ). Download it once to use transcription — it installs automatically and is kept for next
        time.
      </p>
      <PrimaryButton onClick={onDownload}>Download model</PrimaryButton>
    </div>
  );
}

/** Optional NVIDIA GPU acceleration — shown only when an NVIDIA GPU is present. One-time
 * download of the self-contained CUDA engine; transcription then runs ~7–10× faster. */
function GpuRow({
  status,
  downloading,
  progress,
  onDownload,
}: {
  status: GpuStatus | null;
  downloading: boolean;
  progress: DownloadProgress | null;
  onDownload: () => void;
}) {
  if (!status?.gpuPresent) return null;
  if (downloading) return <DownloadBar label="Downloading GPU engine…" progress={progress} />;
  if (status.downloaded) {
    return <p className="text-body font-semibold text-success">⚡ GPU acceleration on (NVIDIA)</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-pale-gray px-4 py-3">
      <p className="text-body text-midnight-indigo">
        NVIDIA GPU detected. Enable <strong>GPU acceleration</strong> (~7–10× faster on 1–2 min
        clips) — one-time ~435 MB download.
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

function ResultPanel({ result }: { result: TranscribeResult }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-body font-semibold uppercase tracking-wide text-slate-blue">
          Transcript{result.language ? ` · ${result.language}` : ""}
        </p>
        <button
          type="button"
          onClick={copy}
          className={`text-body font-semibold text-action-blue hover:brightness-110 ${focusRing}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-cloud-mist p-4 text-body-lg text-midnight-indigo">
        {result.text || "(empty — no speech detected)"}
      </pre>
      <p className="break-words text-body text-slate-blue">Saved: {result.outputPath}</p>
    </Card>
  );
}
