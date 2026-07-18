use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use url::Url;

const MAX_PLAYLIST_ITEMS: usize = 100;
const COOKIE_BROWSERS: [&str; 8] = [
    "brave", "chrome", "chromium", "edge", "firefox", "opera", "safari", "vivaldi",
];
const MP3_BITRATES: [u32; 6] = [320, 256, 192, 128, 96, 64];

/// One downloadable MP4 quality. `height` is absent for extractors that expose
/// video without resolution metadata. `filesize` is the merged video + audio
/// estimate when yt-dlp reports enough information.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoOption {
    pub height: Option<u32>,
    pub label: String,
    pub ext: String,
    pub filesize: Option<u64>,
}

/// Metadata shown before download. `source` is yt-dlp's extractor name and
/// `has_audio` lets the UI select a sensible default for audio-only links.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbe {
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub source: String,
    pub has_audio: bool,
    pub video: Vec<VideoOption>,
}

/// Live download progress streamed to the UI. `total` is absent when the
/// extractor cannot report a source size.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub percent: f64,
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn normalize_http_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let parsed =
        Url::parse(trimmed).map_err(|_| "Please enter a valid http(s) URL.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("Please enter a valid http(s) URL.".into());
    }
    Ok(parsed.to_string())
}

fn cookie_args(browser: Option<&str>) -> Result<Vec<String>, String> {
    let Some(browser) = browser.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(Vec::new());
    };
    let browser = browser.to_ascii_lowercase();
    if !COOKIE_BROWSERS.contains(&browser.as_str()) {
        return Err("Unsupported browser cookie source.".into());
    }
    Ok(vec!["--cookies-from-browser".into(), browser])
}

/// Flags every yt-dlp invocation needs.
///
/// `--encoding utf-8` is not cosmetic: on Windows yt-dlp writes `--print` output and
/// JSON dumps in the console codepage (cp1252 on a pt-BR machine), which is not valid
/// UTF-8. `String::from_utf8_lossy` then turns an accented title into U+FFFD, so the
/// reported file path no longer resolves and the next step (ffmpeg) fails on a file
/// that does not exist. Forcing utf-8 keeps every printed path and title round-trippable.
pub(crate) fn base_ytdlp_args(cookie_browser: Option<&str>) -> Result<Vec<String>, String> {
    let mut args = vec!["--ignore-config".into(), "--encoding".into(), "utf-8".into()];
    args.extend(cookie_args(cookie_browser)?);
    Ok(args)
}

fn last_error_line(stderr: &str) -> &str {
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("unknown extractor error")
        .trim_start_matches("ERROR:")
        .trim()
}

/// Convert common extractor failures into stable, actionable product messages.
/// Unknown failures retain only the final stderr line so the UI stays readable.
fn friendly_ytdlp_error(stderr: &str, action: &str) -> String {
    let lower = stderr.to_ascii_lowercase();
    let message = if lower.contains("drm") {
        "This media is DRM-protected. Toolzy cannot bypass DRM.".to_string()
    } else if lower.contains("could not copy") && lower.contains("cookie")
        || lower.contains("failed to decrypt") && lower.contains("cookie")
        || lower.contains("cookie database")
    {
        "Could not read that browser's cookies. Close the browser and try again, or choose another browser.".to_string()
    } else if lower.contains("login required")
        || lower.contains("sign in")
        || lower.contains("authentication")
        || lower.contains("cookies are required")
        || lower.contains("age-restricted")
    {
        "This media requires sign-in. Select the browser where you are signed in, then try again."
            .to_string()
    } else if lower.contains("geo") && lower.contains("restrict")
        || lower.contains("not available in your country")
        || lower.contains("not available in your region")
    {
        "This media is not available in your region.".to_string()
    } else if lower.contains("http error 429")
        || lower.contains("too many requests")
        || lower.contains("rate limit")
    {
        "The site is rate-limiting requests. Wait a few minutes and try again.".to_string()
    } else if lower.contains("unsupported url") || lower.contains("no suitable extractor") {
        "This site or URL is not currently supported by yt-dlp.".to_string()
    } else if lower.contains("private video")
        || lower.contains("video unavailable")
        || lower.contains("media unavailable")
        || lower.contains("has been removed")
        || lower.contains("not found")
    {
        "This media is private, removed, or unavailable.".to_string()
    } else {
        last_error_line(stderr).chars().take(300).collect()
    };
    format!("{action} failed. {message}")
}

fn parse_expanded_urls(stdout: &str, original: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut urls = Vec::new();
    for line in stdout.lines().take(MAX_PLAYLIST_ITEMS) {
        let Ok(url) = normalize_http_url(line) else {
            continue;
        };
        if seen.insert(url.clone()) {
            urls.push(url);
        }
    }
    if urls.is_empty() {
        urls.push(original.to_string());
    }
    urls
}

/// Expand a single media URL or playlist into canonical item URLs without
/// downloading media. Expansion is capped to keep accidental playlists bounded.
#[tauri::command]
pub async fn expand_media_urls(
    app: tauri::AppHandle,
    url: String,
    cookie_browser: Option<String>,
) -> Result<Vec<String>, String> {
    let url = normalize_http_url(&url)?;
    let mut args = base_ytdlp_args(cookie_browser.as_deref())?;
    args.extend([
        "--flat-playlist".into(),
        "--playlist-end".into(),
        MAX_PLAYLIST_ITEMS.to_string(),
        "--print".into(),
        "%(webpage_url)s".into(),
        url.clone(),
    ]);

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(friendly_ytdlp_error(
            &String::from_utf8_lossy(&output.stderr),
            "Link analysis",
        ));
    }
    Ok(parse_expanded_urls(
        &String::from_utf8_lossy(&output.stdout),
        &url,
    ))
}

fn size_of(format: &Value) -> Option<u64> {
    format
        .get("filesize")
        .and_then(Value::as_u64)
        .or_else(|| format.get("filesize_approx").and_then(Value::as_u64))
}

fn has_video(format: &Value) -> bool {
    matches!(format.get("vcodec").and_then(Value::as_str), Some(codec) if codec != "none")
}

fn has_audio(format: &Value) -> bool {
    matches!(format.get("acodec").and_then(Value::as_str), Some(codec) if codec != "none")
}

fn is_audio_only(format: &Value) -> bool {
    !has_video(format) && has_audio(format)
}

fn audio_bitrate(format: &Value) -> f64 {
    format.get("abr").and_then(Value::as_f64).unwrap_or(0.0)
}

fn best_audio_size(formats: &[Value]) -> Option<u64> {
    formats
        .iter()
        .filter(|format| is_audio_only(format))
        .max_by(|a, b| audio_bitrate(a).total_cmp(&audio_bitrate(b)))
        .and_then(size_of)
}

/// One MP4 row per height. A combined format already includes audio, while a
/// video-only format receives the best audio estimate.
fn video_options(formats: &[Value]) -> Vec<VideoOption> {
    let audio = best_audio_size(formats);
    let mut by_height: BTreeMap<u32, Option<u64>> = BTreeMap::new();

    for format in formats.iter().filter(|format| has_video(format)) {
        let Some(height) = format
            .get("height")
            .and_then(Value::as_u64)
            .filter(|height| *height > 0)
        else {
            continue;
        };
        let filesize = if has_audio(format) {
            size_of(format)
        } else {
            match (size_of(format), audio) {
                (Some(video), Some(audio)) => Some(video + audio),
                (video, _) => video,
            }
        };
        let entry = by_height.entry(height as u32).or_insert(None);
        if filesize.unwrap_or(0) > entry.unwrap_or(0) {
            *entry = filesize;
        }
    }

    by_height
        .into_iter()
        .rev()
        .map(|(height, filesize)| VideoOption {
            height: Some(height),
            label: format!("{height}p"),
            ext: "mp4".into(),
            filesize,
        })
        .collect()
}

fn parse_probe(json: &str) -> Result<MediaProbe, String> {
    let value: Value =
        serde_json::from_str(json).map_err(|e| format!("Metadata parse failed: {e}"))?;
    let formats = value
        .get("formats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let reports_video = formats.iter().any(has_video) || has_video(&value);
    let reports_audio = formats.iter().any(has_audio) || has_audio(&value);
    let mut video = video_options(&formats);
    if reports_video && video.is_empty() {
        video.push(VideoOption {
            height: None,
            label: "Best available".into(),
            ext: "mp4".into(),
            filesize: size_of(&value).or_else(|| formats.iter().filter_map(size_of).max()),
        });
    }

    Ok(MediaProbe {
        title: value
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("Untitled media")
            .to_string(),
        thumbnail: value
            .get("thumbnail")
            .and_then(Value::as_str)
            .map(str::to_string),
        duration: value.get("duration").and_then(Value::as_f64),
        source: value
            .get("extractor_key")
            .or_else(|| value.get("extractor"))
            .and_then(Value::as_str)
            .unwrap_or("Generic")
            .to_string(),
        has_audio: reports_audio,
        video,
    })
}

/// Inspect one media item without downloading it.
#[tauri::command]
pub async fn probe_media(
    app: tauri::AppHandle,
    url: String,
    cookie_browser: Option<String>,
) -> Result<MediaProbe, String> {
    let url = normalize_http_url(&url)?;
    let mut args = base_ytdlp_args(cookie_browser.as_deref())?;
    args.extend([
        "--no-playlist".into(),
        "--dump-single-json".into(),
        "--no-warnings".into(),
        url,
    ]);

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(friendly_ytdlp_error(
            &String::from_utf8_lossy(&output.stderr),
            "Link analysis",
        ));
    }
    parse_probe(&String::from_utf8_lossy(&output.stdout))
}

const PROGRESS_PREFIX: &str = "PROG|";

/// Shared flags for machine-readable progress and the final moved file path.
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

fn build_ytdlp_args(
    template: String,
    ffmpeg_dir: Option<&Path>,
    format: &str,
    height: Option<u32>,
    audio_bitrate: Option<u32>,
    cookie_browser: Option<&str>,
    url: String,
) -> Result<Vec<String>, String> {
    let mut args = base_ytdlp_args(cookie_browser)?;
    args.extend(["--no-playlist".into(), "-o".into(), template]);

    if let Some(dir) = ffmpeg_dir {
        args.extend([
            "--ffmpeg-location".into(),
            dir.to_string_lossy().to_string(),
        ]);
    }

    match format {
        "mp3" => {
            if let Some(bitrate) = audio_bitrate {
                if !MP3_BITRATES.contains(&bitrate) {
                    return Err("Unsupported MP3 bitrate.".into());
                }
            }
            args.extend([
                "-f".into(),
                "ba/b".into(),
                "-x".into(),
                "--audio-format".into(),
                "mp3".into(),
            ]);
            if let Some(bitrate) = audio_bitrate {
                args.extend(["--audio-quality".into(), format!("{bitrate}K")]);
            }
        }
        "mp4" => {
            if height.is_some_and(|height| height == 0 || height > 8_640) {
                return Err("Unsupported video height.".into());
            }
            let selector = height.map_or_else(
                || "bv*+ba/b".to_string(),
                |height| format!("bv*[height<={height}]+ba/b[height<={height}]"),
            );
            args.extend([
                "-f".into(),
                selector,
                "-S".into(),
                "vcodec:h264,acodec:aac,res,fps,hdr:12".into(),
                "--merge-output-format".into(),
                "mp4/mkv".into(),
                "--remux-video".into(),
                "mp4".into(),
                "--recode-video".into(),
                "mp4".into(),
            ]);
        }
        _ => return Err("Unsupported download format.".into()),
    }

    args.extend(ytdlp_progress_args());
    args.push(url);
    Ok(args)
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let mut fields = line.strip_prefix(PROGRESS_PREFIX)?.split('|');
    let downloaded = fields.next()?.trim().parse::<u64>().ok()?;
    let total = fields
        .next()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .or_else(|| {
            fields
                .next()
                .and_then(|value| value.trim().parse::<u64>().ok())
        });
    let percent = match total {
        Some(total) if total > 0 => (downloaded as f64 / total as f64) * 100.0,
        _ => 0.0,
    };
    Some(DownloadProgress {
        percent,
        downloaded,
        total,
    })
}

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
            // yt-dlp renders an unknown byte count as the literal "NA", so a PROG| line
            // can fail to parse and still be progress — never a path. Promoting it would
            // hand the caller `PROG|NA|NA|NA` as the saved file.
            None if trimmed.starts_with(PROGRESS_PREFIX) => {}
            None => text = Some(trimmed.to_string()),
        }
    }
    text
}

/// Spawn yt-dlp, stream progress, and return the final printed file path. This
/// stays shared with link transcription.
pub(crate) async fn run_download(
    app: &tauri::AppHandle,
    args: Vec<String>,
    on_progress: &Channel<DownloadProgress>,
) -> Result<Option<String>, String> {
    let (mut rx, _child) = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| e.to_string())?
        .env("PYTHONUNBUFFERED", "1")
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut path_line = None;
    let mut error_tail = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                if let Some(text) = drain_progress(&bytes, on_progress) {
                    path_line = Some(text);
                }
            }
            CommandEvent::Stderr(bytes) => {
                if let Some(text) = drain_progress(&bytes, on_progress) {
                    error_tail = text;
                }
            }
            CommandEvent::Terminated(payload) if payload.code != Some(0) => {
                return Err(friendly_ytdlp_error(&error_tail, "Download"));
            }
            _ => {}
        }
    }
    Ok(path_line)
}

/// Download one URL as an actual MP4 or MP3 in the OS Downloads directory.
#[tauri::command]
pub async fn download_media(
    app: tauri::AppHandle,
    url: String,
    format: String,
    height: Option<u32>,
    audio_bitrate: Option<u32>,
    cookie_browser: Option<String>,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String> {
    let url = normalize_http_url(&url)?;
    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let template = downloads
        .join("%(title)s [%(id)s].%(ext)s")
        .to_string_lossy()
        .to_string();
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let args = build_ytdlp_args(
        template,
        executable.parent(),
        &format,
        height,
        audio_bitrate,
        cookie_browser.as_deref(),
        url,
    )?;

    let path_line = run_download(&app, args, &on_progress).await?;
    Ok(path_line.unwrap_or_else(|| downloads.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(format: &str, height: Option<u32>, bitrate: Option<u32>) -> Vec<String> {
        build_ytdlp_args(
            "out".into(),
            None,
            format,
            height,
            bitrate,
            None,
            "https://example.com/media".into(),
        )
        .unwrap()
    }

    #[test]
    fn validates_and_normalizes_http_urls() {
        assert_eq!(
            normalize_http_url(" https://example.com/video ").unwrap(),
            "https://example.com/video"
        );
        assert!(normalize_http_url("file:///tmp/video").is_err());
        assert!(normalize_http_url("https://").is_err());
    }

    #[test]
    fn every_call_forces_utf8_output() {
        // Regression: yt-dlp otherwise prints paths/titles in the Windows console
        // codepage, which from_utf8_lossy corrupts into U+FFFD.
        let base = base_ytdlp_args(None).unwrap();
        assert!(base.windows(2).any(|pair| pair == ["--encoding", "utf-8"]));
        assert!(args("mp3", None, None)
            .windows(2)
            .any(|pair| pair == ["--encoding", "utf-8"]));
    }

    #[test]
    fn cookie_browser_is_allow_listed() {
        assert_eq!(
            cookie_args(Some("Edge")).unwrap(),
            vec!["--cookies-from-browser", "edge"]
        );
        assert!(cookie_args(Some("custom:profile")).is_err());
    }

    #[test]
    fn expansion_dedupes_and_falls_back() {
        let urls = parse_expanded_urls(
            "https://example.com/a\ninvalid\nhttps://example.com/a\nhttps://example.com/b\n",
            "https://example.com/original",
        );
        assert_eq!(urls, vec!["https://example.com/a", "https://example.com/b"]);
        assert_eq!(
            parse_expanded_urls("NA", "https://example.com/original"),
            vec!["https://example.com/original"]
        );
    }

    #[test]
    fn maps_known_extractor_errors() {
        assert!(friendly_ytdlp_error("ERROR: Unsupported URL", "Probe")
            .contains("not currently supported"));
        assert!(friendly_ytdlp_error("This video is DRM protected", "Probe")
            .contains("cannot bypass DRM"));
        assert!(friendly_ytdlp_error("Sign in to confirm", "Probe").contains("Select the browser"));
    }

    #[test]
    fn mp3_selects_audio_and_requested_bitrate() {
        let args = args("mp3", None, Some(320));
        assert!(args.windows(2).any(|pair| pair == ["-f", "ba/b"]));
        assert!(args.contains(&"320K".to_string()));
        assert!(args.contains(&"--ignore-config".to_string()));
    }

    #[test]
    fn rejects_unknown_format_and_bitrate() {
        assert!(build_ytdlp_args(
            "out".into(),
            None,
            "wav",
            None,
            None,
            None,
            "https://x.dev".into()
        )
        .is_err());
        assert!(build_ytdlp_args(
            "out".into(),
            None,
            "mp3",
            None,
            Some(111),
            None,
            "https://x.dev".into()
        )
        .is_err());
    }

    #[test]
    fn mp4_caps_height_and_guarantees_final_container() {
        let args = args("mp4", Some(720), None);
        assert!(args.contains(&"bv*[height<=720]+ba/b[height<=720]".to_string()));
        assert!(args.windows(2).any(|pair| pair == ["--remux-video", "mp4"]));
        assert!(args
            .windows(2)
            .any(|pair| pair == ["--recode-video", "mp4"]));
    }

    #[test]
    fn args_request_progress_template() {
        let args = args("mp4", None, None);
        assert!(args.contains(&"--progress".to_string()));
        assert!(args.iter().any(|value| value.contains("download:PROG|")));
    }

    #[test]
    fn parse_progress_uses_total_or_estimate() {
        let exact = parse_progress("PROG|500|1000|2000").unwrap();
        assert_eq!(exact.total, Some(1000));
        assert_eq!(exact.percent, 50.0);
        let estimate = parse_progress("PROG|250|NA|1000").unwrap();
        assert_eq!(estimate.total, Some(1000));
        assert_eq!(estimate.percent, 25.0);
        assert_eq!(parse_progress("PROG|250|NA|NA").unwrap().total, None);
        assert!(parse_progress("ERROR: unavailable").is_none());
        // yt-dlp can render the downloaded count itself as "NA" before the first chunk.
        assert!(parse_progress("PROG|NA|NA|NA").is_none());
    }

    #[test]
    fn probe_extracts_source_audio_and_video_heights() {
        let json = r#"{
            "title": "Demo",
            "extractor_key": "Vimeo",
            "thumbnail": "https://img.example/x.jpg",
            "duration": 200.0,
            "formats": [
                {"vcodec": "none", "acodec": "mp4a", "abr": 128.0, "filesize": 1000},
                {"vcodec": "avc1", "acodec": "none", "height": 720, "filesize": 5000},
                {"vcodec": "vp9", "acodec": "none", "height": 1080, "filesize_approx": 9000},
                {"vcodec": "avc1", "acodec": "aac", "height": 480, "filesize": 4000}
            ]
        }"#;
        let probe = parse_probe(json).unwrap();
        assert_eq!(probe.source, "Vimeo");
        assert!(probe.has_audio);
        assert_eq!(probe.video[0].height, Some(1080));
        assert_eq!(probe.video[0].filesize, Some(10_000));
        assert_eq!(probe.video[2].filesize, Some(4_000));
    }

    #[test]
    fn probe_adds_best_available_for_video_without_height() {
        let probe = parse_probe(
            r#"{"title":"Clip","extractor":"generic","formats":[{"vcodec":"h264","acodec":"aac","filesize":42}]}"#,
        )
        .unwrap();
        assert_eq!(probe.video.len(), 1);
        assert_eq!(probe.video[0].height, None);
        assert_eq!(probe.video[0].label, "Best available");
    }

    #[test]
    fn audio_only_probe_has_no_video_rows() {
        let probe = parse_probe(
            r#"{"title":"Track","formats":[{"vcodec":"none","acodec":"opus","abr":128}]}"#,
        )
        .unwrap();
        assert!(probe.has_audio);
        assert!(probe.video.is_empty());
    }
}
