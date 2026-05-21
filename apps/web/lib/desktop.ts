export type DownloadFormat = "mp4" | "mp3";

/** True when running inside the Tauri desktop shell (Tauri v2 sets this global). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Ask the desktop backend to download a URL as mp4/mp3 via the yt-dlp sidecar.
 * `@tauri-apps/api` is imported only here so the web bundle never loads it.
 * Returns the saved file path. Throws on failure.
 */
export async function downloadMedia(url: string, format: DownloadFormat): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("download_media", { url, format });
}
