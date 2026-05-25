import { useCallback, useEffect, useState } from "react";
import type { DownloadProgress } from "./media";
import { type GpuStatus, downloadGpuEngine, gpuEngineStatus } from "./transcribe";

/**
 * Optional NVIDIA (CUDA) GPU engine state for the Transcribe tool: presence/install
 * status and a one-time on-demand download with streamed progress. `onError` surfaces
 * a download failure (pass the host's error setter); it's called with `null` on start.
 */
export function useGpuEngine(onError: (e: string | null) => void) {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const reload = useCallback(() => {
    gpuEngineStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);
  useEffect(reload, []);

  const download = useCallback(async () => {
    setDownloading(true);
    setProgress(null);
    onError(null);
    try {
      await downloadGpuEngine(setProgress);
      reload();
    } catch (e) {
      onError(String(e));
    }
    setDownloading(false);
    setProgress(null);
  }, [reload, onError]);

  return { status, downloading, progress, download };
}
