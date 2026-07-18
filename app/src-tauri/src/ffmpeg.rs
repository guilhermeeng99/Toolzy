//! Shared ffmpeg-sidecar plumbing for the native media commands (convert + audio
//! and video edits). Keeps the spawn + error shape, the output-naming rule, and a
//! couple of pure filter/parse helpers in one place so each command module stays
//! small. Every edit needs the bundled `ffmpeg` sidecar at runtime.

use std::path::{Path, PathBuf};

use tauri_plugin_shell::ShellExt;

/// The last stderr line that actually says something.
///
/// `.lines().last()` is wrong here: Tauri's `Command::output()` appends its own newline
/// after every captured chunk, so ffmpeg's stderr always ends in a blank line and the
/// naive tail rendered a bare `"ffmpeg failed."` with no reason. Pure → unit-tested.
fn last_error_line(stderr: &str) -> &str {
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("unknown error")
}

/// Run the bundled ffmpeg sidecar with `args`, mapping a non-zero exit to the
/// stderr tail. Shared by every native media command so the failure message has
/// one shape. Needs the `ffmpeg` sidecar.
pub async fn run_ffmpeg(app: &tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!("ffmpeg failed. {}", last_error_line(&stderr)))
}

/// Output path beside the input: `clip.mp4` + `"trimmed"` → `clip-trimmed.mp4`.
/// Keeps the directory and the extension (edits re-encode/copy into the same
/// container). Pure → unit-tested.
pub fn with_suffix(src: &Path, suffix: &str) -> PathBuf {
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let name = match src.extension().and_then(|s| s.to_str()) {
        Some(ext) if !ext.is_empty() => format!("{stem}-{suffix}.{ext}"),
        _ => format!("{stem}-{suffix}"),
    };
    src.with_file_name(name)
}

/// ffmpeg's `atempo` accepts only 0.5–2.0 per instance, so reach factors outside
/// that by chaining: `4.0` → `"atempo=2.0,atempo=2.0"`, `0.25` →
/// `"atempo=0.5,atempo=0.5"`. Used by both audio and video speed edits. The V1 UI
/// caps speed to 0.5–2.0 (one step), but keeping this general means the cap can
/// widen without touching the filter. Pure → unit-tested.
pub fn atempo_chain(mut factor: f64) -> String {
    let mut steps: Vec<String> = Vec::new();
    while factor > 2.0 {
        steps.push("atempo=2.0".into());
        factor /= 2.0;
    }
    while factor < 0.5 {
        steps.push("atempo=0.5".into());
        factor /= 0.5; // i.e. *= 2
    }
    steps.push(format!("atempo={factor}"));
    steps.join(",")
}

/// Pull the media length (seconds) out of ffmpeg's `Duration: HH:MM:SS.xx` banner
/// line. Pure → unit-tested. `None` when the line/shape is missing.
fn parse_duration(stderr: &str) -> Option<f64> {
    let after = stderr.split("Duration:").nth(1)?;
    let hms = after.split(',').next()?.trim(); // "HH:MM:SS.xx"
    let mut parts = hms.split(':');
    let h: f64 = parts.next()?.trim().parse().ok()?;
    let m: f64 = parts.next()?.trim().parse().ok()?;
    let s: f64 = parts.next()?.trim().parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Read a local media file's duration in seconds for the trim UIs. `ffmpeg -i`
/// with no output writes the stream banner (incl. `Duration:`) to stderr and exits
/// non-zero, so we parse stderr regardless of the exit code. Needs the ffmpeg
/// sidecar.
#[tauri::command]
pub async fn probe_duration(app: tauri::AppHandle, path: String) -> Result<f64, String> {
    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(["-i", &path])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_duration(&stderr).ok_or_else(|| "could not read duration".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_suffix_keeps_dir_and_ext() {
        let p = with_suffix(Path::new("/a/b/clip.mp4"), "trimmed");
        assert_eq!(p, PathBuf::from("/a/b/clip-trimmed.mp4"));
    }

    #[test]
    fn with_suffix_handles_no_extension() {
        let p = with_suffix(Path::new("/a/b/clip"), "speed");
        assert_eq!(p, PathBuf::from("/a/b/clip-speed"));
    }

    #[test]
    fn atempo_single_step_in_range() {
        assert_eq!(atempo_chain(1.5), "atempo=1.5");
        assert_eq!(atempo_chain(0.5), "atempo=0.5");
        assert_eq!(atempo_chain(2.0), "atempo=2");
    }

    #[test]
    fn atempo_chains_above_two() {
        // 2.0 * 2.0 = 4.0x
        assert_eq!(atempo_chain(4.0), "atempo=2.0,atempo=2");
    }

    #[test]
    fn atempo_chains_below_half() {
        // 0.5 * 0.5 = 0.25x
        assert_eq!(atempo_chain(0.25), "atempo=0.5,atempo=0.5");
    }

    #[test]
    fn parse_duration_reads_hms() {
        let s = "  Duration: 00:01:30.50, start: 0.000000, bitrate: 128 kb/s";
        assert_eq!(parse_duration(s), Some(90.5));
    }

    #[test]
    fn parse_duration_reads_full_hours() {
        assert_eq!(parse_duration("Duration: 01:00:00.00,"), Some(3600.0));
    }

    #[test]
    fn last_error_line_skips_the_trailing_blank() {
        // Regression: Tauri's Command::output() appends a newline per captured chunk, so
        // ffmpeg's stderr ends blank and `.lines().last()` rendered a bare "ffmpeg failed.".
        let stderr = "  libswresample   6.  3.102\nError opening input files: No such file or directory\r\n\n";
        assert_eq!(
            last_error_line(stderr),
            "Error opening input files: No such file or directory"
        );
    }

    #[test]
    fn last_error_line_falls_back_when_nothing_was_written() {
        assert_eq!(last_error_line(""), "unknown error");
        assert_eq!(last_error_line("\n \n"), "unknown error");
    }

    #[test]
    fn parse_duration_missing_line_is_none() {
        assert_eq!(parse_duration("Input #0, mp3, from 'x.mp3':"), None);
    }
}
