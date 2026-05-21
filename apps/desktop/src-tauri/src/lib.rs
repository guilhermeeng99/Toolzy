use std::path::Path;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

/// Build the yt-dlp argument list. Kept separate from the command so it stays
/// small and unit-testable.
///
/// `ffmpeg_dir` points yt-dlp at the bundled ffmpeg (needed to merge video+audio
/// and to extract mp3) so it works even when ffmpeg is not on the user's PATH.
/// The trailing `--print after_move:filepath` makes yt-dlp emit the final,
/// post-processed file path on stdout.
fn build_ytdlp_args(template: String, ffmpeg_dir: Option<&Path>, format: &str, url: String) -> Vec<String> {
    let mut args: Vec<String> = vec!["--no-playlist".into(), "-o".into(), template];

    if let Some(dir) = ffmpeg_dir {
        args.push("--ffmpeg-location".into());
        args.push(dir.to_string_lossy().to_string());
    }

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

    args.extend([
        "--quiet".into(),
        "--no-simulate".into(),
        "--print".into(),
        "after_move:filepath".into(),
    ]);
    args.push(url);
    args
}

/// Download a URL as mp4/mp3 with the bundled yt-dlp + ffmpeg sidecars. Runs on
/// the user's own machine and connection (see docs/specs/media-download.md).
/// Returns the saved file path, or an error message.
#[tauri::command]
async fn download_media(app: tauri::AppHandle, url: String, format: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Please paste a valid http(s) URL.".into());
    }

    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let template = downloads.join("%(title)s.%(ext)s").to_string_lossy().to_string();

    // Bundled sidecars sit next to the executable; use that dir for ffmpeg.
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let ffmpeg_dir = exe.parent();

    let args = build_ytdlp_args(template, ffmpeg_dir, &format, url);

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Download failed. {}",
            stderr.lines().last().unwrap_or("unknown error")
        ));
    }

    // `--print after_move:filepath` writes the final path; fall back to the folder.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let path = stdout
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .unwrap_or_else(|| downloads.to_string_lossy().to_string());
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![download_media])
        .run(tauri::generate_context!())
        .expect("error while running Toolzy");
}
