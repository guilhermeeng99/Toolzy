import { useCallback, useEffect, useState } from "react";
import type { DownloadProgress } from "./media";
import { type WhisperModel, downloadWhisperModel, listWhisperModels } from "./transcribe";

const MODEL_KEY = "toolzy.transcribe.model";

/**
 * Whisper model state for the Transcribe tool: the installed-model list, the
 * remembered selection (localStorage), and a one-time download with streamed
 * progress. `onError` surfaces a download failure to the host component (pass its
 * error setter); it's called with `null` when a download starts.
 */
export function useWhisperModels(onError: (e: string | null) => void) {
  const [models, setModels] = useState<WhisperModel[]>([]);
  const [modelId, setModelId] = useState(() => localStorage.getItem(MODEL_KEY) ?? "large-v3");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const reload = useCallback(() => {
    listWhisperModels()
      .then(setModels)
      .catch(() => {});
  }, []);
  useEffect(reload, []);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, modelId);
  }, [modelId]);

  const selected = models.find((m) => m.id === modelId);
  const needsDownload = !!selected && !selected.downloaded;

  const download = useCallback(async () => {
    setDownloading(true);
    setProgress(null);
    onError(null);
    try {
      await downloadWhisperModel(modelId, setProgress);
      reload();
    } catch (e) {
      onError(String(e));
    }
    setDownloading(false);
    setProgress(null);
  }, [modelId, reload, onError]);

  return { models, modelId, setModelId, selected, needsDownload, downloading, progress, download };
}
