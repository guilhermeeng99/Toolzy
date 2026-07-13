import { useEffect, useState } from "react";
import type { DownloadProgress } from "../lib/media";
import { formatTime } from "../lib/time";
import { type LinkTranscribeResult, type WhisperModel, transcribeLink } from "../lib/transcribe";
import { useElapsedSeconds } from "../lib/useElapsedSeconds";
import { useGpuEngine } from "../lib/useGpuEngine";
import { useWhisperModels } from "../lib/useWhisperModels";
import { DownloadBar } from "./DownloadBar";
import { MediaDownloadPanel } from "./MediaDownloadPanel";
import { Card, Field, ModeTabs, PrimaryButton, Select, Spinner, focusRing } from "./ui";

type DownloadMode = "download" | "transcribe";
type LinkStage = "download" | "transcribe";

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
        <Field label="Video or audio link">
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
