use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// Download a URL as mp4/mp3 with the bundled yt-dlp sidecar. Runs on the user's
/// own machine and connection (see docs/specs/media-download.md). Returns the
/// folder the file was saved to, or an error message.
///
/// Note: yt-dlp needs ffmpeg to merge video+audio and to extract mp3. Ship the
/// ffmpeg sidecar and, if it is not on PATH, pass `--ffmpeg-location` pointing at
/// the bundled binary's directory.
#[tauri::command]
async fn download_media(app: tauri::AppHandle, url: String, format: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Please paste a valid http(s) URL.".into());
    }

    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let template = downloads
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .to_string();

    let mut args: Vec<String> = vec!["--no-playlist".into(), "-o".into(), template];
    if format == "mp3" {
        args.extend(["-x".into(), "--audio-format".into(), "mp3".into()]);
    } else {
        args.extend([
            "-f".into(),
            "bv*+ba/b".into(),
            "--merge-output-format".into(),
            "mp4".into(),
        ]);
    }
    args.push(url);

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(downloads.to_string_lossy().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "Download failed. {}",
            stderr.lines().last().unwrap_or("unknown error")
        ))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![download_media])
        .run(tauri::generate_context!())
        .expect("error while running Toolzy");
}
