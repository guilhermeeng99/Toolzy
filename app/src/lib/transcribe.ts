import { Channel, invoke } from "@tauri-apps/api/core";
import type { DownloadProgress } from "./media";

/** A Whisper model offered in the picker; `downloaded` = already installed locally. */
export interface WhisperModel {
  id: string;
  label: string;
  sizeMb: number;
  downloaded: boolean;
}

/** Result of a transcription run (transcript text + where it was saved). */
export interface TranscribeResult {
  text: string;
  outputPath: string;
  language: string;
}

/** Result of transcribing a link directly to an organized Markdown transcript. */
export interface LinkTranscribeResult {
  title: string;
  sourceUrl: string;
  text: string;
  outputPath: string;
  language: string;
  segmentCount: number;
}

/** Live recognition progress (0–100) from whisper-cli `--print-progress`. */
export interface TranscribeProgress {
  percent: number;
}

export const TRANSCRIBE_FORMATS = ["txt", "srt", "vtt", "json"] as const;
export type TranscribeFormat = (typeof TRANSCRIBE_FORMATS)[number];

/** Source extensions accepted by the transcriber (audio + video; ffmpeg demuxes). */
export const TRANSCRIBE_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "flac",
  "aac",
  "ogg",
  "opus",
  "mp4",
  "mkv",
  "mov",
  "webm",
];

/** List the offered models, flagging which are already installed. */
export function listWhisperModels(): Promise<WhisperModel[]> {
  return invoke<WhisperModel[]>("list_whisper_models");
}

/**
 * Download (install) a model + the small VAD model into the app-data dir, streaming
 * progress over a Tauri channel. Reuses an already-installed model. Returns its path.
 */
export function downloadWhisperModel(
  model: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const channel = new Channel<DownloadProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return invoke<string>("download_whisper_model", { model, onProgress: channel });
}

/** NVIDIA GPU presence + whether the optional GPU engine is installed. */
export interface GpuStatus {
  gpuPresent: boolean;
  downloaded: boolean;
}

/** Is an NVIDIA GPU present, and is the GPU engine downloaded? Drives the GPU toggle. */
export function gpuEngineStatus(): Promise<GpuStatus> {
  return invoke<GpuStatus>("gpu_engine_status");
}

/** Download the self-contained NVIDIA (CUDA) engine on demand (~435 MB), with progress. */
export function downloadGpuEngine(onProgress?: (p: DownloadProgress) => void): Promise<void> {
  const channel = new Channel<DownloadProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return invoke<void>("download_gpu_engine", { onProgress: channel });
}

/** Kill the in-flight transcription (the Cancel button). No-op when idle. */
export function cancelTranscription(): Promise<void> {
  return invoke<void>("cancel_transcription");
}

/**
 * Transcribe (or translate→English) a file to text beside the input. `language`
 * omitted ⇒ auto-detect. Faithful by design (VAD + deterministic decoding in Rust).
 * Needs the chosen model already downloaded.
 */
export function transcribeAudio(
  path: string,
  model: string,
  opts?: { language?: string; task?: "transcribe" | "translate"; format?: TranscribeFormat },
  onProgress?: (p: TranscribeProgress) => void,
): Promise<TranscribeResult> {
  const channel = new Channel<TranscribeProgress>();
  if (onProgress) channel.onmessage = onProgress;
  return invoke<TranscribeResult>("transcribe_audio", {
    path,
    model,
    language: opts?.language,
    task: opts?.task,
    format: opts?.format,
    onProgress: channel,
  });
}

/** Download a link's best audio, transcribe locally, and save a Markdown transcript. */
export function transcribeLink(
  url: string,
  model: string,
  opts?: { language?: string },
  onDownloadProgress?: (p: DownloadProgress) => void,
  onTranscribeProgress?: (p: TranscribeProgress) => void,
): Promise<LinkTranscribeResult> {
  const downloadChannel = new Channel<DownloadProgress>();
  if (onDownloadProgress) downloadChannel.onmessage = onDownloadProgress;
  const transcribeChannel = new Channel<TranscribeProgress>();
  if (onTranscribeProgress) transcribeChannel.onmessage = onTranscribeProgress;
  return invoke<LinkTranscribeResult>("transcribe_link", {
    url,
    model,
    language: opts?.language,
    onDownloadProgress: downloadChannel,
    onTranscribeProgress: transcribeChannel,
  });
}
