import { useEffect, useRef, useState } from "react";
import { formatBytes } from "../lib/format";
import {
  COOKIE_BROWSERS,
  type CookieBrowser,
  type DownloadFormat,
  type DownloadProgress,
  MP3_BITRATES,
  type MediaProbe,
  type VideoOption,
  downloadMedia,
  expandMediaUrls,
  mp3SizeEstimate,
  probeMedia,
} from "../lib/media";
import { DownloadBar, PulseBanner } from "./DownloadBar";
import { Badge, Card, Field, PrimaryButton, Select, Spinner, focusRing, pill } from "./ui";

type ItemStatus = "probing" | "ready" | "downloading" | "saved" | "failed" | "error";

interface MediaItem {
  id: string;
  url: string;
  probe: MediaProbe | null;
  status: ItemStatus;
  format: DownloadFormat;
  height: number | null;
  audioBitrate: number;
  progress: DownloadProgress | null;
  finishing: boolean;
  message: string | null;
}

interface AnalysisSummary {
  unique: number;
  duplicates: number;
  invalid: number;
}

const DEFAULT_AUDIO_BITRATE = 192;

function inputUrls(value: string): { valid: string[]; invalid: number } {
  const tokens = value
    .split(/\s+/)
    .map((url) => url.trim())
    .filter(Boolean);
  const valid = tokens.filter((url) => /^https?:\/\/\S+$/i.test(url));
  return { valid, invalid: tokens.length - valid.length };
}

function uniqueUrls(urls: string[]): { urls: string[]; duplicates: number } {
  const seen = new Set<string>();
  const unique = urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
  return { urls: unique, duplicates: urls.length - unique.length };
}

function pendingItem(url: string): MediaItem {
  return {
    id: url,
    url,
    probe: null,
    status: "probing",
    format: "mp4",
    height: null,
    audioBitrate: DEFAULT_AUDIO_BITRATE,
    progress: null,
    finishing: false,
    message: null,
  };
}

function probedItem(item: MediaItem, probe: MediaProbe): MediaItem {
  const hasVideo = probe.video.length > 0;
  if (!hasVideo && !probe.hasAudio) {
    return {
      ...item,
      probe,
      status: "error",
      message: "No downloadable audio or video formats were reported for this link.",
    };
  }
  return {
    ...item,
    probe,
    status: "ready",
    format: hasVideo ? "mp4" : "mp3",
    height: probe.video[0]?.height ?? null,
  };
}

export function MediaDownloadPanel() {
  const [input, setInput] = useState("");
  const [cookieBrowser, setCookieBrowser] = useState<CookieBrowser>("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [queueActive, setQueueActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const finishTimer = useRef<number | null>(null);
  const busy = analyzing || queueActive || items.some((item) => item.status === "downloading");

  useEffect(
    () => () => {
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
    },
    [],
  );

  function patchItem(id: string, patch: Partial<MediaItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function probeItem(item: MediaItem) {
    patchItem(item.id, { status: "probing", message: null });
    try {
      const probe = await probeMedia(item.url, cookieBrowser);
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? probedItem(currentItem, probe) : currentItem,
        ),
      );
    } catch (probeError) {
      patchItem(item.id, { status: "error", message: String(probeError) });
    }
  }

  async function analyze() {
    const parsed = inputUrls(input);
    if (parsed.valid.length === 0) {
      setError("Enter at least one valid http(s) URL.");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setSummary(null);
    setItems([]);
    const rawUnique = uniqueUrls(parsed.valid);
    const expanded: string[] = [];
    const expansionErrors: MediaItem[] = [];

    for (const url of rawUnique.urls) {
      try {
        expanded.push(...(await expandMediaUrls(url, cookieBrowser)));
      } catch (expandError) {
        expansionErrors.push({
          ...pendingItem(url),
          status: "error",
          message: String(expandError),
        });
      }
    }

    const expandedUnique = uniqueUrls(expanded);
    const nextItems = [...expandedUnique.urls.map(pendingItem), ...expansionErrors];
    setItems(nextItems);
    setSummary({
      unique: nextItems.length,
      duplicates: rawUnique.duplicates + expandedUnique.duplicates,
      invalid: parsed.invalid,
    });

    for (const item of nextItems.filter((item) => item.status === "probing")) {
      await probeItem(item);
    }
    setAnalyzing(false);
  }

  async function performDownload(item: MediaItem) {
    patchItem(item.id, {
      status: "downloading",
      progress: null,
      finishing: false,
      message: null,
    });

    const onProgress = (progress: DownloadProgress) => {
      patchItem(item.id, { progress, finishing: false });
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
      if (progress.total != null && progress.percent >= 99) {
        finishTimer.current = window.setTimeout(
          () => patchItem(item.id, { finishing: true }),
          1_500,
        );
      }
    };

    try {
      const path = await downloadMedia(
        item.url,
        item.format,
        {
          height: item.format === "mp4" ? (item.height ?? undefined) : undefined,
          audioBitrate: item.format === "mp3" ? item.audioBitrate : undefined,
          cookieBrowser,
        },
        onProgress,
      );
      patchItem(item.id, {
        status: "saved",
        progress: null,
        finishing: false,
        message: `Saved to ${path}`,
      });
    } catch (downloadError) {
      patchItem(item.id, {
        status: "failed",
        progress: null,
        finishing: false,
        message: String(downloadError),
      });
    }
    if (finishTimer.current) window.clearTimeout(finishTimer.current);
  }

  async function downloadOne(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item?.probe) return;
    await performDownload(item);
  }

  async function downloadAll() {
    const queue = items.filter(
      (item) => item.probe && ["ready", "failed", "saved"].includes(item.status),
    );
    if (queue.length === 0) return;
    setQueueActive(true);
    for (const item of queue) await performDownload(item);
    setQueueActive(false);
  }

  function selectFormat(id: string, format: DownloadFormat) {
    patchItem(id, { format, status: "ready", message: null });
  }

  const actionable = items.filter(
    (item) => item.probe && ["ready", "failed", "saved"].includes(item.status),
  );
  const saved = items.filter((item) => item.status === "saved").length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Field label="Video, audio, or playlist links">
          <textarea
            value={input}
            rows={4}
            placeholder={"Paste one or more links, separated by spaces or lines\nhttps://..."}
            onChange={(event) => setInput(event.target.value)}
            className="w-full resize-y rounded-lg border border-platinum-tint bg-snow-white px-4 py-3 text-body-lg text-midnight-indigo focus-visible:border-action-blue focus-visible:outline-none"
          />
        </Field>

        <div className="grid items-end gap-4 lg:grid-cols-[1fr_auto]">
          <Field label="Use cookies from (optional)">
            <Select
              value={cookieBrowser}
              onChange={(value) => setCookieBrowser(value as CookieBrowser)}
            >
              {COOKIE_BROWSERS.map((browser) => (
                <option key={browser.value || "none"} value={browser.value}>
                  {browser.label}
                </option>
              ))}
            </Select>
          </Field>
          <PrimaryButton onClick={analyze} disabled={busy || !input.trim()}>
            {analyzing ? "Analyzing..." : "Analyze links"}
          </PrimaryButton>
        </div>

        {cookieBrowser ? (
          <p className="rounded-lg bg-pale-gray px-4 py-3 text-body text-midnight-indigo">
            Toolzy will ask yt-dlp to read cookies from this browser for this analysis and its
            downloads. Cookies remain local and are not stored by Toolzy. Close the browser first if
            its cookie database is locked.
          </p>
        ) : null}

        {analyzing ? (
          <div className="flex items-center gap-3 text-body-lg text-action-blue">
            <Spinner /> Expanding playlists and reading media information...
          </div>
        ) : null}
      </Card>

      {error ? <p className="break-words text-body-lg text-danger">{error}</p> : null}
      {summary ? <Summary summary={summary} /> : null}

      {actionable.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-snow-white p-4 shadow-sm-2">
          <p className="text-body-lg font-semibold text-midnight-indigo">
            {saved}/{actionable.length} saved
          </p>
          <PrimaryButton onClick={downloadAll} disabled={busy}>
            {queueActive ? "Downloading queue..." : `Download all (${actionable.length})`}
          </PrimaryButton>
        </div>
      ) : null}

      {items.map((item) => (
        <MediaItemCard
          key={item.id}
          item={item}
          disabled={busy}
          onRetry={() => probeItem(item)}
          onFormat={(format) => selectFormat(item.id, format)}
          onHeight={(height) => patchItem(item.id, { height, status: "ready", message: null })}
          onBitrate={(audioBitrate) =>
            patchItem(item.id, { audioBitrate, status: "ready", message: null })
          }
          onDownload={() => downloadOne(item.id)}
        />
      ))}

      <p className="text-body text-slate-blue">
        Supports public or user-authorized media handled by yt-dlp. DRM cannot be bypassed. Only
        download content you own or are allowed to download; site terms and local law remain your
        responsibility.
      </p>
    </div>
  );
}

function Summary({ summary }: { summary: AnalysisSummary }) {
  const notes = [`${summary.unique} unique media link${summary.unique === 1 ? "" : "s"}`];
  if (summary.duplicates) notes.push(`${summary.duplicates} duplicate(s) removed`);
  if (summary.invalid) notes.push(`${summary.invalid} invalid input(s) skipped`);
  return <p className="text-body text-slate-blue">{notes.join(" · ")}</p>;
}

function MediaItemCard({
  item,
  disabled,
  onRetry,
  onFormat,
  onHeight,
  onBitrate,
  onDownload,
}: {
  item: MediaItem;
  disabled: boolean;
  onRetry: () => void;
  onFormat: (format: DownloadFormat) => void;
  onHeight: (height: number | null) => void;
  onBitrate: (bitrate: number) => void;
  onDownload: () => void;
}) {
  if (!item.probe) {
    return (
      <Card>
        <p className="break-all text-body text-slate-blue">{item.url}</p>
        {item.status === "probing" ? (
          <div className="flex items-center gap-3 text-body-lg text-action-blue">
            <Spinner /> Reading media information...
          </div>
        ) : (
          <>
            <p className="break-words text-body-lg text-danger">{item.message}</p>
            <PrimaryButton onClick={onRetry} disabled={disabled} className="self-start">
              Retry analysis
            </PrimaryButton>
          </>
        )}
      </Card>
    );
  }

  const phase = item.format === "mp3" ? "Converting to MP3..." : "Finalizing MP4...";
  return (
    <Card>
      <div className="flex items-start gap-4">
        {item.probe.thumbnail ? (
          <img
            src={item.probe.thumbnail}
            alt=""
            referrerPolicy="no-referrer"
            className="h-20 w-32 shrink-0 rounded-lg object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>{item.probe.source}</Badge>
            <span className="text-body text-slate-blue">
              {item.probe.duration ? `${Math.round(item.probe.duration)}s` : "Duration unknown"}
            </span>
          </div>
          <p className="break-words text-body-lg font-semibold text-midnight-indigo">
            {item.probe.title}
          </p>
          <p className="mt-1 truncate text-body text-slate-blue" title={item.url}>
            {item.url}
          </p>
        </div>
      </div>

      <ItemStatusBanner item={item} phase={phase} />

      <div className="flex gap-2">
        <button
          type="button"
          className={pill(item.format === "mp4")}
          onClick={() => onFormat("mp4")}
          disabled={disabled || item.probe.video.length === 0}
        >
          Video (MP4)
        </button>
        <button
          type="button"
          className={pill(item.format === "mp3")}
          onClick={() => onFormat("mp3")}
          disabled={disabled || !item.probe.hasAudio}
        >
          Audio (MP3)
        </button>
      </div>

      {item.format === "mp4" ? (
        <VideoChoices
          options={item.probe.video}
          selected={item.height}
          disabled={disabled}
          onSelect={onHeight}
        />
      ) : (
        <AudioChoices
          duration={item.probe.duration}
          selected={item.audioBitrate}
          disabled={disabled}
          onSelect={onBitrate}
        />
      )}

      <PrimaryButton onClick={onDownload} disabled={disabled} className="self-start">
        {item.status === "saved" ? "Download again" : "Download selected"}
      </PrimaryButton>
    </Card>
  );
}

function ItemStatusBanner({ item, phase }: { item: MediaItem; phase: string }) {
  if (item.status === "downloading") {
    return item.finishing ? (
      <PulseBanner label={phase} />
    ) : (
      <DownloadBar
        label={`Downloading ${item.probe?.title ?? "media"}...`}
        progress={item.progress}
      />
    );
  }
  if (!item.message) return null;
  const success = item.status === "saved";
  return (
    <div
      className={`break-words rounded-lg px-4 py-3 text-body-lg font-medium ${
        success ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      {success ? "✓ " : "✕ "}
      {item.message}
    </div>
  );
}

function VideoChoices({
  options,
  selected,
  disabled,
  onSelect,
}: {
  options: VideoOption[];
  selected: number | null;
  disabled: boolean;
  onSelect: (height: number | null) => void;
}) {
  if (options.length === 0) {
    return <p className="text-body text-slate-blue">This source reported no video stream.</p>;
  }
  return (
    <ChoiceTable
      rows={options.map((option) => ({
        key: option.height?.toString() ?? "best",
        label: option.label,
        format: "MP4",
        size: option.filesize,
        selected: option.height === selected,
        select: () => onSelect(option.height),
      }))}
      disabled={disabled}
    />
  );
}

function AudioChoices({
  duration,
  selected,
  disabled,
  onSelect,
}: {
  duration: number | null;
  selected: number;
  disabled: boolean;
  onSelect: (bitrate: number) => void;
}) {
  return (
    <ChoiceTable
      rows={MP3_BITRATES.map((bitrate) => ({
        key: bitrate.toString(),
        label: `${bitrate} kbps`,
        format: "MP3",
        size: mp3SizeEstimate(duration, bitrate),
        selected: bitrate === selected,
        select: () => onSelect(bitrate),
      }))}
      disabled={disabled}
    />
  );
}

interface ChoiceRow {
  key: string;
  label: string;
  format: string;
  size: number | null;
  selected: boolean;
  select: () => void;
}

function ChoiceTable({ rows, disabled }: { rows: ChoiceRow[]; disabled: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-body font-semibold uppercase tracking-wide text-slate-blue">
            <th className="pb-2">Select</th>
            <th className="pb-2">Quality</th>
            <th className="pb-2">Format</th>
            <th className="pb-2">Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-platinum-tint text-body-lg">
              <td className="py-3">
                <input
                  type="radio"
                  checked={row.selected}
                  onChange={row.select}
                  disabled={disabled}
                  aria-label={`Select ${row.label} ${row.format}`}
                  className={`h-4 w-4 accent-action-blue ${focusRing}`}
                />
              </td>
              <td className="py-3 font-semibold text-midnight-indigo">{row.label}</td>
              <td className="py-3 text-slate-blue">{row.format}</td>
              <td className="py-3 text-slate-blue">
                {row.size == null ? "—" : formatBytes(row.size)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
