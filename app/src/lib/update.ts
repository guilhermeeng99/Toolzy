import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";

export { getVersion };
export type { Update };

/** Check GitHub Releases for a newer signed version. Returns null if up to date
 * or if the check fails (offline, rate-limited) — never throws to the UI. */
export async function checkForUpdate(): Promise<Update | null> {
  try {
    return await check();
  } catch {
    return null;
  }
}

/** Download + install the update, then relaunch into the new version. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
