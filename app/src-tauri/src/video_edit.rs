//! Native video edits via the bundled ffmpeg sidecar: trim, merge, add audio,
//! rotate, mirror, change speed. Each command validates its options, builds the
//! ffmpeg args (pure builders below, unit-tested), runs the sidecar, and returns
//! the saved path. The dedicated Video tab; see `docs/specs/video-edit.md`.

use std::path::Path;

use crate::ffmpeg::{atempo_chain, run_ffmpeg, with_suffix};

/// Lossless trim: fast seek (`-ss` before `-i`) + copy `dur` seconds (`-c copy`).
/// The cut snaps to the nearest keyframe at or before `start`.
fn video_trim_args(path: &str, start: f64, dur: f64, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-ss".into(),
        format!("{start}"),
        "-i".into(),
        path.into(),
        "-t".into(),
        format!("{dur}"),
        "-c".into(),
        "copy".into(),
        out.into(),
    ]
}

/// concat-demuxer list-file body: one `file '<path>'` per input. Backslashes are
/// normalised to `/` and single quotes escaped (`'\''`) so the list parses on every
/// OS. Pure → unit-tested.
fn concat_list(paths: &[String]) -> String {
    paths
        .iter()
        .map(|p| {
            let safe = p.replace('\\', "/").replace('\'', r"'\''");
            format!("file '{safe}'")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Stream-copy concat (clips must share codec/resolution/format).
fn merge_args(list: &str, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list.into(),
        "-c".into(),
        "copy".into(),
        out.into(),
    ]
}

/// Replace the video's audio with `audio` (AAC), ending at the shorter stream.
fn add_audio_args(video: &str, audio: &str, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        video.into(),
        "-i".into(),
        audio.into(),
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "1:a:0".into(),
        "-c:v".into(),
        "copy".into(),
        "-c:a".into(),
        "aac".into(),
        "-shortest".into(),
        out.into(),
    ]
}

/// `transpose` chain for a clockwise rotation. `None` for unsupported angles.
fn rotate_filter(degrees: u32) -> Option<String> {
    match degrees {
        90 => Some("transpose=1".into()),
        180 => Some("transpose=1,transpose=1".into()),
        270 => Some("transpose=2".into()),
        _ => None,
    }
}

/// Flip filter: horizontal (`hflip`) or vertical (`vflip`). `None` otherwise.
fn mirror_filter(direction: &str) -> Option<&'static str> {
    match direction {
        "horizontal" => Some("hflip"),
        "vertical" => Some("vflip"),
        _ => None,
    }
}

/// Apply a video filter, copying the audio through unchanged (rotate / mirror).
fn filter_args(path: &str, filter: &str, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        path.into(),
        "-vf".into(),
        filter.into(),
        "-c:a".into(),
        "copy".into(),
        out.into(),
    ]
}

/// `filter_complex` for a speed change: scale video PTS by `1/factor` and retime
/// audio with an `atempo` chain. Assumes the source has an audio track.
fn video_speed_filter(factor: f64) -> String {
    let pts = 1.0 / factor;
    format!("[0:v]setpts={pts}*PTS[v];[0:a]{}[a]", atempo_chain(factor))
}

fn video_speed_args(path: &str, filter: &str, out: &str) -> Vec<String> {
    vec![
        "-y".into(),
        "-i".into(),
        path.into(),
        "-filter_complex".into(),
        filter.into(),
        "-map".into(),
        "[v]".into(),
        "-map".into(),
        "[a]".into(),
        out.into(),
    ]
}

/// Trim a video to `[start, end]` (seconds), lossless. Writes `base-trimmed.<ext>`
/// beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn trim_video(
    app: tauri::AppHandle,
    path: String,
    start: f64,
    end: f64,
) -> Result<String, String> {
    if !(start >= 0.0 && start < end) {
        return Err("invalid trim range".into());
    }
    let out = with_suffix(Path::new(&path), "trimmed").to_string_lossy().to_string();
    run_ffmpeg(&app, video_trim_args(&path, start, end - start, &out)).await?;
    Ok(out)
}

/// Concatenate `paths` (≥ 2 clips, same format) into `out`. Uses the concat
/// demuxer with `-c copy` via a temp list file (removed afterwards). Needs the
/// ffmpeg sidecar.
#[tauri::command]
pub async fn merge_videos(
    app: tauri::AppHandle,
    paths: Vec<String>,
    out: String,
) -> Result<String, String> {
    if paths.len() < 2 {
        return Err("need at least two videos".into());
    }
    let list_path = std::env::temp_dir().join(format!(
        "toolzy-concat-{}.txt",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::write(&list_path, concat_list(&paths))
        .map_err(|e| format!("could not write merge list: {e}"))?;

    let result = run_ffmpeg(&app, merge_args(&list_path.to_string_lossy(), &out)).await;
    let _ = std::fs::remove_file(&list_path); // best-effort cleanup
    result?;
    Ok(out)
}

/// Replace `video`'s audio with `audio` (AAC, `-shortest`). Writes
/// `base-audio.<ext>` beside the video. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn add_audio_to_video(
    app: tauri::AppHandle,
    video: String,
    audio: String,
) -> Result<String, String> {
    let out = with_suffix(Path::new(&video), "audio").to_string_lossy().to_string();
    run_ffmpeg(&app, add_audio_args(&video, &audio, &out)).await?;
    Ok(out)
}

/// Rotate the video clockwise by `degrees` (90/180/270). Writes
/// `base-rotated.<ext>` beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn rotate_video(
    app: tauri::AppHandle,
    path: String,
    degrees: u32,
) -> Result<String, String> {
    let filter = rotate_filter(degrees).ok_or("unsupported rotation")?;
    let out = with_suffix(Path::new(&path), "rotated").to_string_lossy().to_string();
    run_ffmpeg(&app, filter_args(&path, &filter, &out)).await?;
    Ok(out)
}

/// Flip the video `"horizontal"` or `"vertical"`. Writes `base-mirrored.<ext>`
/// beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn mirror_video(
    app: tauri::AppHandle,
    path: String,
    direction: String,
) -> Result<String, String> {
    let filter = mirror_filter(&direction).ok_or("unsupported mirror direction")?;
    let out = with_suffix(Path::new(&path), "mirrored").to_string_lossy().to_string();
    run_ffmpeg(&app, filter_args(&path, filter, &out)).await?;
    Ok(out)
}

/// Change playback speed by `factor` (0.5–2.0); audio retimed (needs an audio
/// track). Writes `base-speed.<ext>` beside the input. Needs the ffmpeg sidecar.
#[tauri::command]
pub async fn change_video_speed(
    app: tauri::AppHandle,
    path: String,
    factor: f64,
) -> Result<String, String> {
    if !(0.5..=2.0).contains(&factor) {
        return Err("speed out of range".into());
    }
    let out = with_suffix(Path::new(&path), "speed").to_string_lossy().to_string();
    run_ffmpeg(&app, video_speed_args(&path, &video_speed_filter(factor), &out)).await?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_seeks_before_input_and_copies() {
        let a = video_trim_args("in.mp4", 2.0, 5.0, "out.mp4");
        let ss = a.iter().position(|s| s == "-ss").unwrap();
        let i = a.iter().position(|s| s == "-i").unwrap();
        assert!(ss < i); // fast seek
        assert!(a.contains(&"copy".to_string()));
        assert!(a.contains(&"5".to_string())); // duration = end - start
    }

    #[test]
    fn concat_list_one_line_per_path() {
        let body = concat_list(&["/a/b.mp4".into(), "c:\\d\\e.mp4".into()]);
        assert_eq!(body, "file '/a/b.mp4'\nfile 'c:/d/e.mp4'");
    }

    #[test]
    fn concat_list_escapes_single_quotes() {
        let body = concat_list(&["/a'b.mp4".into()]);
        assert_eq!(body, r"file '/a'\''b.mp4'");
    }

    #[test]
    fn merge_args_use_concat_demuxer_copy() {
        let a = merge_args("list.txt", "out.mp4");
        assert!(a.contains(&"concat".to_string()));
        assert!(a.contains(&"copy".to_string()));
        assert!(a.contains(&"-safe".to_string()));
    }

    #[test]
    fn add_audio_maps_video_and_audio() {
        let a = add_audio_args("v.mp4", "a.mp3", "out.mp4");
        assert!(a.contains(&"0:v:0".to_string()));
        assert!(a.contains(&"1:a:0".to_string()));
        assert!(a.contains(&"-shortest".to_string()));
        assert!(a.contains(&"aac".to_string()));
    }

    #[test]
    fn rotate_filter_maps_degrees() {
        assert_eq!(rotate_filter(90).as_deref(), Some("transpose=1"));
        assert_eq!(rotate_filter(180).as_deref(), Some("transpose=1,transpose=1"));
        assert_eq!(rotate_filter(270).as_deref(), Some("transpose=2"));
        assert_eq!(rotate_filter(45), None);
    }

    #[test]
    fn mirror_filter_maps_direction() {
        assert_eq!(mirror_filter("horizontal"), Some("hflip"));
        assert_eq!(mirror_filter("vertical"), Some("vflip"));
        assert_eq!(mirror_filter("diagonal"), None);
    }

    #[test]
    fn video_speed_filter_scales_pts_and_tempo() {
        assert_eq!(
            video_speed_filter(2.0),
            "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2[a]"
        );
    }

    #[test]
    fn video_speed_args_map_filter_outputs() {
        let a = video_speed_args("in.mp4", "f", "out.mp4");
        assert!(a.contains(&"-filter_complex".to_string()));
        assert!(a.contains(&"[v]".to_string()));
        assert!(a.contains(&"[a]".to_string()));
    }
}
