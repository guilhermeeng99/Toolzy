//! Native audio edits via the bundled ffmpeg sidecar: trim to a range, change
//! volume, change speed. Each command validates its options, builds the ffmpeg
//! args (pure builders below, unit-tested), runs the sidecar, and returns the path
//! of the file written beside the input. Modes of the Media tab; see
//! `docs/specs/audio-edit.md`.

use std::path::Path;

use crate::ffmpeg::{atempo_chain, run_ffmpeg, with_suffix};

/// `-ss`/`-to` are placed **after** `-i` so the cut is accurate (decode-then-trim);
/// no `-c copy`, so ffmpeg re-encodes with the output extension's default encoder.
fn trim_args(path: &str, start: f64, end: f64, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        path.into(),
        "-ss".into(),
        format!("{start}"),
        "-to".into(),
        format!("{end}"),
        out.into(),
    ]
}

/// `volume=<factor>` where factor = percent / 100 (100% = unchanged, 0% = mute).
fn volume_args(path: &str, percent: u32, out: &str) -> Vec<String> {
    let factor = percent as f64 / 100.0;
    vec![
        "-y".into(),
        "-i".into(),
        path.into(),
        "-filter:a".into(),
        format!("volume={factor}"),
        out.into(),
    ]
}

/// `atempo` chain (pitch preserved). Chain handles factors beyond 0.5–2.0; the V1
/// command caps to that range.
fn speed_args(path: &str, factor: f64, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        path.into(),
        "-filter:a".into(),
        atempo_chain(factor),
        out.into(),
    ]
}

/// Trim audio to `[start, end]` (seconds), re-encoding into the same container.
/// Writes `base-trimmed.<ext>` beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn trim_audio(
    app: tauri::AppHandle,
    path: String,
    start: f64,
    end: f64,
) -> Result<String, String> {
    if !(start >= 0.0 && start < end) {
        return Err("invalid trim range".into());
    }
    let out = with_suffix(Path::new(&path), "trimmed").to_string_lossy().to_string();
    run_ffmpeg(&app, trim_args(&path, start, end, &out)).await?;
    Ok(out)
}

/// Scale audio volume by `percent` (0 = mute, 100 = unchanged, up to 400). Writes
/// `base-volume.<ext>` beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn change_audio_volume(
    app: tauri::AppHandle,
    path: String,
    percent: u32,
) -> Result<String, String> {
    if percent > 400 {
        return Err("volume out of range".into());
    }
    let out = with_suffix(Path::new(&path), "volume").to_string_lossy().to_string();
    run_ffmpeg(&app, volume_args(&path, percent, &out)).await?;
    Ok(out)
}

/// Change audio speed by `factor` (0.5–2.0; pitch preserved via `atempo`). Writes
/// `base-speed.<ext>` beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn change_audio_speed(
    app: tauri::AppHandle,
    path: String,
    factor: f64,
) -> Result<String, String> {
    if !(0.5..=2.0).contains(&factor) {
        return Err("speed out of range".into());
    }
    let out = with_suffix(Path::new(&path), "speed").to_string_lossy().to_string();
    run_ffmpeg(&app, speed_args(&path, factor, &out)).await?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_args_seek_after_input() {
        let a = trim_args("in.mp3", 1.5, 10.0, "out.mp3");
        // -i comes before -ss for an accurate cut.
        let i = a.iter().position(|s| s == "-i").unwrap();
        let ss = a.iter().position(|s| s == "-ss").unwrap();
        assert!(i < ss);
        assert!(a.contains(&"1.5".to_string()));
        assert!(a.contains(&"10".to_string()));
        assert!(a.contains(&"-to".to_string()));
    }

    #[test]
    fn volume_args_convert_percent_to_factor() {
        assert!(volume_args("in.mp3", 150, "out.mp3").contains(&"volume=1.5".to_string()));
        assert!(volume_args("in.mp3", 100, "out.mp3").contains(&"volume=1".to_string()));
        assert!(volume_args("in.mp3", 0, "out.mp3").contains(&"volume=0".to_string()));
    }

    #[test]
    fn speed_args_use_atempo() {
        assert!(speed_args("in.mp3", 1.5, "out.mp3").contains(&"atempo=1.5".to_string()));
        assert!(speed_args("in.mp3", 2.0, "out.mp3").contains(&"-filter:a".to_string()));
    }
}
