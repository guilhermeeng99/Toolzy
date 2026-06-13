use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// One downloadable MP4 quality. `filesize` is the *merged* (video + best audio)
/// estimate in bytes — yt-dlp's `filesize`/`filesize_approx`; `None` when the
/// source reports neither.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoOption {
    pub height: u32,
    pub label: String,
    pub ext: String,
    pub filesize: Option<u64>,
}

/// Probe result shown before the user picks a quality: the title/thumbnail to
/// confirm the right link, the duration (drives MP3 size estimates in the UI),
/// and the available MP4 resolutions.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbe {
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub video: Vec<VideoOption>,
}

/// Live download progress streamed to the UI over a Tauri channel. `total` is
/// `None` while the source size is unknown; `percent` is 0 then.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub percent: f64,
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// yt-dlp reports the byte size as `filesize`, or `filesize_approx` for DASH
/// streams where it can only estimate. Prefer the exact one.
fn size_of(f: &Value) -> Option<u64> {
    f.get("filesize")
        .and_then(Value::as_u64)
        .or_else(|| f.get("filesize_approx").and_then(Value::as_u64))
}

fn is_audio_only(f: &Value) -> bool {
    let no_video = f.get("vcodec").and_then(Value::as_str) == Some("none");
    let has_audio = matches!(f.get("acodec").and_then(Value::as_str), Some(c) if c != "none");
    no_video && has_audio
}

fn abr(f: &Value) -> f64 {
    f.get("abr").and_then(Value::as_f64).unwrap_or(0.0)
}

/// Size of the audio track a merge would pick (`ba` = highest-bitrate audio-only
/// stream). Added to each video size so the listed MP4 size is the merged total.
fn best_audio_size(formats: &[Value]) -> Option<u64> {
    formats
        .iter()
        .filter(|f| is_audio_only(f))
        .max_by(|a, b| abr(a).total_cmp(&abr(b)))
        .and_then(size_of)
}

/// One MP4 row per distinct video height, sorted high → low. Per height we keep
/// the largest estimate (closest to what `bv*` actually selects) + best audio.
fn video_options(formats: &[Value]) -> Vec<VideoOption> {
    let audio = best_audio_size(formats);
    let mut by_height: BTreeMap<u32, Option<u64>> = BTreeMap::new();

    for f in formats {
        let has_video = matches!(f.get("vcodec").and_then(Value::as_str), Some(c) if c != "none");
        let Some(h) = f.get("height").and_then(Value::as_u64).filter(|h| *h > 0) else {
            continue;
        };
        if !has_video {
            continue;
        }
        let merged = match (size_of(f), audio) {
            (Some(v), Some(a)) => Some(v + a),
            (v, _) => v,
        };
        let entry = by_height.entry(h as u32).or_insert(None);
        if merged.unwrap_or(0) > (*entry).unwrap_or(0) {
            *entry = merged;
        }
    }

    by_height
        .into_iter()
        .rev()
        .map(|(height, filesize)| VideoOption {
            height,
            label: format!("{height}p"),
            ext: "mp4".into(),
            filesize,
        })
        .collect()
}

/// Parse yt-dlp's `--dump-single-json` blob into the slim payload the UI needs.
/// Pure (no I/O) so it is unit-tested against a fixture.
fn parse_probe(json: &str) -> Result<MediaProbe, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("parse failed: {e}"))?;
    let formats = v
        .get("formats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(MediaProbe {
        title: v
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("video")
            .to_string(),
        thumbnail: v
            .get("thumbnail")
            .and_then(Value::as_str)
            .map(str::to_string),
        duration: v.get("duration").and_then(Value::as_f64),
        video: video_options(&formats),
    })
}

/// Inspect a link *without downloading*: yt-dlp dumps metadata as JSON, which we
/// trim to title/thumbnail/duration + the available MP4 resolutions. Runs on the
/// user's own machine/IP, same as the download. Needs the yt-dlp sidecar.
#[tauri::command]
pub async fn probe_media(app: tauri::AppHandle, url: String) -> Result<MediaProbe, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Please paste a valid http(s) URL.".into());
    }

    let args = vec![
        "--no-playlist".to_string(),
        "--dump-single-json".to_string(),
        "--no-warnings".to_string(),
        url,
    ];

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
            "Could not read this link. {}",
            stderr.lines().last().unwrap_or("unknown error")
        ));
    }

    parse_probe(&String::from_utf8_lossy(&output.stdout))
}

/// Prefix on the lines our `--progress-template` emits (on stdout, alongside the
/// final `--print` path), so we can tell progress apart from the path / errors.
const PROGRESS_PREFIX: &str = "PROG|";

/// Shared yt-dlp flags for live progress + final file path printing. Used by the
/// downloader and by link transcription, which also needs byte progress while it
/// fetches temporary audio.
pub(crate) fn ytdlp_progress_args() -> Vec<String> {
    vec![
        "--progress".into(),
        "--newline".into(),
        "--progress-template".into(),
        format!(
            "download:{PROGRESS_PREFIX}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s"
        ),
        "--quiet".into(),
        "--no-simulate".into(),
        "--print".into(),
        "after_move:filepath".into(),
    ]
}

/// Build the yt-dlp argument list. Separate from the command so it stays small
/// and unit-testable.
///
/// `ffmpeg_dir` points yt-dlp at the bundled ffmpeg (needed to merge video+audio
/// and to extract mp3) so it works even when ffmpeg is not on PATH. `height` caps
/// the MP4 resolution; `audio_bitrate` sets the MP3 kbps. `--progress-template`
/// emits machine-readable progress (parsed by `parse_progress`); the trailing
/// `--print after_move:filepath` makes yt-dlp emit the final file path on stdout.
fn build_ytdlp_args(
    template: String,
    ffmpeg_dir: Option<&Path>,
    format: &str,
    height: Option<u32>,
    audio_bitrate: Option<u32>,
    url: String,
) -> Vec<String> {
    let mut args: Vec<String> = vec!["--no-playlist".into(), "-o".into(), template];

    if let Some(dir) = ffmpeg_dir {
        args.push("--ffmpeg-location".into());
        args.push(dir.to_string_lossy().to_string());
    }

    if format == "mp3" {
        args.extend(["-x".into(), "--audio-format".into(), "mp3".into()]);
        if let Some(kbps) = audio_bitrate {
            args.push("--audio-quality".into());
            args.push(format!("{kbps}K"));
        }
    } else {
        let selector = match height {
            Some(h) => format!("bv*[height<={h}]+ba/b[height<={h}]"),
            None => "bv*+ba/b".into(),
        };
        args.extend([
            "-f".into(),
            selector,
            "--merge-output-format".into(),
            "mp4".into(),
        ]);
    }

    // `--progress` forces progress even under `--quiet`; `--newline` keeps each
    // update on its own line (yt-dlp writes these to stdout, like `--print`).
    args.extend(ytdlp_progress_args());
    args.push(url);
    args
}

/// Parse one `--progress-template` line ("PROG|downloaded|total|estimate"). Falls
/// back to the estimate when the exact total is "NA"; `None` for non-progress
/// lines. Pure → unit-tested.
fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let mut fields = line.strip_prefix(PROGRESS_PREFIX)?.split('|');
    let downloaded = fields.next()?.trim().parse::<u64>().ok()?;
    let total = fields
        .next()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .or_else(|| fields.next().and_then(|s| s.trim().parse::<u64>().ok()));
    let percent = match total {
        Some(t) if t > 0 => (downloaded as f64 / t as f64) * 100.0,
        _ => 0.0,
    };
    Some(DownloadProgress {
        percent,
        downloaded,
        total,
    })
}

/// Forward every progress line in a stdout/stderr chunk to `on_progress`, and
/// return the last non-empty, non-progress line — the saved path (on stdout) or an
/// error line (on stderr). Keeps `download_media`'s event loop flat (one place that
/// splits a chunk into lines and tells progress apart from text).
fn drain_progress(bytes: &[u8], on_progress: &Channel<DownloadProgress>) -> Option<String> {
    let mut text = None;
    for line in String::from_utf8_lossy(bytes).lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match parse_progress(trimmed) {
            Some(progress) => {
                let _ = on_progress.send(progress);
            }
            None => text = Some(trimmed.to_string()),
        }
    }
    text
}

/// Spawn yt-dlp, stream progress to `on_progress`, and return the final printed file
/// path (the last non-progress stdout line), or `None` if it printed none. A non-zero
/// exit maps to `Err` with the stderr tail. Keeps `download_media` to validate → args →
/// run → default path. Needs the yt-dlp sidecar (`shell:allow-spawn`).
pub(crate) async fn run_download(
    app: &tauri::AppHandle,
    args: Vec<String>,
    on_progress: &Channel<DownloadProgress>,
) -> Result<Option<String>, String> {
    // yt-dlp is a frozen-Python exe; when its stdout is a pipe (not a TTY) Python
    // block-buffers it, so progress lines would arrive in one burst at exit (bar
    // jumps 0 → done). PYTHONUNBUFFERED makes them flush live, line by line.
    let (mut rx, _child) = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .env("PYTHONUNBUFFERED", "1")
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut path_line: Option<String> = None;
    let mut error_tail = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            // yt-dlp writes both the `--progress-template` lines and the
            // `--print after_move:filepath` path to stdout; the path is the last
            // non-progress line.
            CommandEvent::Stdout(bytes) => {
                if let Some(text) = drain_progress(&bytes, on_progress) {
                    path_line = Some(text);
                }
            }
            // Real errors land on stderr; keep the last line for the failure message.
            CommandEvent::Stderr(bytes) => {
                if let Some(text) = drain_progress(&bytes, on_progress) {
                    error_tail = text;
                }
            }
            CommandEvent::Terminated(payload) if payload.code != Some(0) => {
                let reason = if error_tail.is_empty() {
                    "unknown error"
                } else {
                    &error_tail
                };
                return Err(format!("Download failed. {reason}"));
            }
            _ => {}
        }
    }

    Ok(path_line)
}

/// Download a URL as mp4/mp3 with the bundled yt-dlp + ffmpeg sidecars. `height`
/// caps the MP4 resolution; `audio_bitrate` sets the MP3 kbps. Progress is streamed
/// to `on_progress` as it downloads (MP4 has two phases — video then audio — so the
/// percent restarts once). Runs on the user's own machine and connection. Returns
/// the saved file path. Needs the yt-dlp + ffmpeg sidecars (and `shell:allow-spawn`).
#[tauri::command]
pub async fn download_media(
    app: tauri::AppHandle,
    url: String,
    format: String,
    height: Option<u32>,
    audio_bitrate: Option<u32>,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Please paste a valid http(s) URL.".into());
    }

    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let template = downloads
        .join("%(title)s.%(ext)s")
        .to_string_lossy()
        .to_string();

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let args = build_ytdlp_args(template, exe.parent(), &format, height, audio_bitrate, url);

    let path_line = run_download(&app, args, &on_progress).await?;
    Ok(path_line.unwrap_or_else(|| downloads.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mp3_args_request_audio_extraction() {
        let a = build_ytdlp_args("out".into(), None, "mp3", None, None, "u".into());
        assert!(a.contains(&"-x".to_string()));
        assert!(a.contains(&"mp3".to_string()));
    }

    #[test]
    fn mp3_args_set_audio_bitrate() {
        let a = build_ytdlp_args("out".into(), None, "mp3", None, Some(320), "u".into());
        assert!(a.contains(&"--audio-quality".to_string()));
        assert!(a.contains(&"320K".to_string()));
    }

    #[test]
    fn mp4_args_merge_best_video_audio() {
        let a = build_ytdlp_args("out".into(), None, "mp4", None, None, "u".into());
        assert!(a.contains(&"bv*+ba/b".to_string()));
        assert!(a.contains(&"--merge-output-format".to_string()));
    }

    #[test]
    fn mp4_args_cap_height_when_requested() {
        let a = build_ytdlp_args("out".into(), None, "mp4", Some(720), None, "u".into());
        assert!(a.contains(&"bv*[height<=720]+ba/b[height<=720]".to_string()));
    }

    #[test]
    fn args_request_progress_template() {
        let a = build_ytdlp_args("out".into(), None, "mp4", None, None, "u".into());
        assert!(a.contains(&"--progress".to_string()));
        assert!(a.iter().any(|s| s.contains("download:PROG|")));
    }

    #[test]
    fn ffmpeg_location_passed_when_dir_present() {
        let a = build_ytdlp_args(
            "out".into(),
            Some(Path::new("/bin")),
            "mp3",
            None,
            None,
            "u".into(),
        );
        assert!(a.contains(&"--ffmpeg-location".to_string()));
    }

    #[test]
    fn parse_progress_uses_total_bytes() {
        let p = parse_progress("PROG|500|1000|2000").unwrap();
        assert_eq!(p.downloaded, 500);
        assert_eq!(p.total, Some(1000));
        assert_eq!(p.percent, 50.0);
    }

    #[test]
    fn parse_progress_falls_back_to_estimate() {
        let p = parse_progress("PROG|250|NA|1000").unwrap();
        assert_eq!(p.total, Some(1000));
        assert_eq!(p.percent, 25.0);
    }

    #[test]
    fn parse_progress_unknown_total_is_zero_percent() {
        let p = parse_progress("PROG|250|NA|NA").unwrap();
        assert_eq!(p.total, None);
        assert_eq!(p.percent, 0.0);
    }

    #[test]
    fn parse_progress_ignores_non_progress_lines() {
        assert!(parse_progress("ERROR: video unavailable").is_none());
    }

    #[test]
    fn parse_probe_extracts_title_and_video_heights() {
        let json = r#"{
            "title": "Demo",
            "thumbnail": "http://img/x.jpg",
            "duration": 200.0,
            "formats": [
                {"vcodec": "none", "acodec": "mp4a", "abr": 128.0, "filesize": 1000},
                {"vcodec": "avc1", "acodec": "none", "height": 720, "filesize": 5000},
                {"vcodec": "vp9",  "acodec": "none", "height": 1080, "filesize_approx": 9000},
                {"vcodec": "none", "acodec": "none"}
            ]
        }"#;
        let p = parse_probe(json).unwrap();
        assert_eq!(p.title, "Demo");
        assert_eq!(p.duration, Some(200.0));
        // Sorted high → low; size = video + best audio (1000).
        assert_eq!(
            p.video,
            vec![
                VideoOption {
                    height: 1080,
                    label: "1080p".into(),
                    ext: "mp4".into(),
                    filesize: Some(10000)
                },
                VideoOption {
                    height: 720,
                    label: "720p".into(),
                    ext: "mp4".into(),
                    filesize: Some(6000)
                },
            ]
        );
    }

    #[test]
    fn best_audio_size_picks_highest_bitrate() {
        let formats = vec![
            serde_json::json!({"vcodec": "none", "acodec": "mp4a", "abr": 128.0, "filesize": 1000}),
            serde_json::json!({"vcodec": "none", "acodec": "opus", "abr": 160.0, "filesize": 1300}),
            serde_json::json!({"vcodec": "avc1", "acodec": "none", "height": 720, "filesize": 5000}),
        ];
        assert_eq!(best_audio_size(&formats), Some(1300));
    }

    #[test]
    fn best_audio_size_none_when_no_audio_only_track() {
        let formats = vec![
            serde_json::json!({"vcodec": "avc1", "acodec": "none", "height": 720, "filesize": 5000}),
        ];
        assert_eq!(best_audio_size(&formats), None);
    }

    #[test]
    fn video_options_skips_audio_only_and_zero_height() {
        let formats = vec![
            serde_json::json!({"vcodec": "none", "acodec": "mp4a", "abr": 128.0, "filesize": 1000}),
            serde_json::json!({"vcodec": "avc1", "acodec": "none", "height": 0, "filesize": 5000}),
            serde_json::json!({"vcodec": "avc1", "acodec": "none", "height": 480, "filesize": 3000}),
        ];
        let v = video_options(&formats);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].height, 480);
        assert_eq!(v[0].filesize, Some(4000)); // 3000 video + 1000 best audio
    }

    #[test]
    fn parse_probe_dedupes_height_keeping_largest() {
        let json = r#"{
            "title": "Dup",
            "formats": [
                {"vcodec": "avc1", "acodec": "none", "height": 1080, "filesize": 4000},
                {"vcodec": "vp9",  "acodec": "none", "height": 1080, "filesize": 7000}
            ]
        }"#;
        let p = parse_probe(json).unwrap();
        assert_eq!(p.video.len(), 1);
        assert_eq!(p.video[0].filesize, Some(7000));
    }
}
