use std::path::Path;

use tauri_plugin_shell::ShellExt;

pub const AUDIO_TARGETS: &[&str] = &["mp3", "m4a", "wav"];

/// ffmpeg codec args per target. `aac` is ffmpeg's built-in encoder.
fn audio_codec(target: &str) -> Vec<String> {
    match target {
        "mp3" => vec!["-acodec".into(), "libmp3lame".into(), "-q:a".into(), "2".into()],
        "m4a" => vec!["-acodec".into(), "aac".into(), "-b:a".into(), "192k".into()],
        _ => vec!["-acodec".into(), "pcm_s16le".into()], // wav
    }
}

/// Extract/convert audio from a media file using the bundled ffmpeg sidecar.
/// `-vn` drops video. Output is written beside the input; returns its path.
#[tauri::command]
pub async fn convert_media(
    app: tauri::AppHandle,
    path: String,
    target: String,
) -> Result<String, String> {
    if !AUDIO_TARGETS.contains(&target.as_str()) {
        return Err(format!("unsupported target: {target}"));
    }

    let src = Path::new(&path);
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("audio");
    let out = src.with_file_name(format!("{stem}.{target}"));
    let out_str = out.to_string_lossy().to_string();

    let mut args = vec!["-y".to_string(), "-i".to_string(), path.clone(), "-vn".to_string()];
    args.extend(audio_codec(&target));
    args.push(out_str.clone());

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(out_str)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "ffmpeg failed. {}",
            stderr.lines().last().unwrap_or("unknown error")
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mp3_uses_libmp3lame() {
        assert!(audio_codec("mp3").contains(&"libmp3lame".to_string()));
    }

    #[test]
    fn m4a_uses_aac() {
        assert!(audio_codec("m4a").contains(&"aac".to_string()));
    }

    #[test]
    fn wav_falls_back_to_pcm() {
        assert!(audio_codec("wav").contains(&"pcm_s16le".to_string()));
    }
}
