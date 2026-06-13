use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::download::{run_download, ytdlp_progress_args, DownloadProgress};
use crate::transcription::{
    ensure_transcription_model_ready, transcribe_path_to_base, TranscribeProgress, TranscribeState,
};

const BLOCK_PAUSE_MS: u64 = 2_500;
const BLOCK_TARGET_CHARS: usize = 520;
const BLOCK_MAX_CHARS: usize = 900;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkTranscribeResult {
    title: String,
    source_url: String,
    text: String,
    output_path: String,
    language: String,
    segment_count: usize,
}

#[derive(Debug, Clone, PartialEq)]
struct TranscriptSegment {
    start_ms: u64,
    end_ms: u64,
    text: String,
}

#[derive(Debug, PartialEq)]
struct TranscriptBlock {
    start_ms: u64,
    end_ms: u64,
    text: String,
}

fn validate_url(url: &str) -> Result<(), String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(())
    } else {
        Err("Please paste a valid http(s) URL.".into())
    }
}

fn temp_job_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("toolzy-link-transcribe-{nanos}"))
}

fn title_from_audio(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("transcript")
        .to_string()
}

fn output_base(downloads: &Path, title: &str) -> PathBuf {
    downloads.join(format!("{title} - transcript"))
}

fn build_audio_download_args(
    template: String,
    ffmpeg_dir: Option<&Path>,
    url: String,
) -> Vec<String> {
    let mut args = vec![
        "--no-playlist".into(),
        "--windows-filenames".into(),
        "--trim-filenames".into(),
        "180".into(),
        "-f".into(),
        "ba/bestaudio/best".into(),
        "-o".into(),
        template,
    ];
    if let Some(dir) = ffmpeg_dir {
        args.push("--ffmpeg-location".into());
        args.push(dir.to_string_lossy().to_string());
    }
    args.extend(ytdlp_progress_args());
    args.push(url);
    args
}

async fn download_audio(
    app: &AppHandle,
    url: String,
    on_progress: &Channel<DownloadProgress>,
) -> Result<PathBuf, String> {
    let dir = temp_job_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let template = dir.join("%(title)s.%(ext)s").to_string_lossy().to_string();
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let args = build_audio_download_args(template, exe.parent(), url);
    let path = run_download(app, args, on_progress)
        .await?
        .ok_or_else(|| "Download failed. yt-dlp did not report the saved file path.".to_string())?;
    Ok(PathBuf::from(path))
}

fn parse_segments(json: &str) -> Result<Vec<TranscriptSegment>, String> {
    let root: Value =
        serde_json::from_str(json).map_err(|e| format!("parse transcript failed: {e}"))?;
    let items = root
        .get("transcription")
        .and_then(Value::as_array)
        .ok_or("parse transcript failed: missing transcription array")?;
    let token_segments: Vec<_> = items.iter().flat_map(token_segments_from_value).collect();
    if !token_segments.is_empty() {
        return Ok(token_segments);
    }
    let segments = items
        .iter()
        .filter_map(segment_from_value)
        .filter(|s| !s.text.is_empty())
        .flat_map(split_segment_by_words)
        .collect();
    Ok(segments)
}

fn segment_from_value(v: &Value) -> Option<TranscriptSegment> {
    let offsets = v.get("offsets")?;
    Some(TranscriptSegment {
        start_ms: offsets.get("from")?.as_u64()?,
        end_ms: offsets.get("to")?.as_u64()?,
        text: clean_text(v.get("text")?.as_str()?),
    })
}

fn split_segment_by_words(segment: TranscriptSegment) -> Vec<TranscriptSegment> {
    let words: Vec<_> = segment.text.split_whitespace().collect();
    if words.len() <= 1 {
        return vec![segment];
    }
    let duration = segment.end_ms.saturating_sub(segment.start_ms);
    if duration <= 1_500 {
        return vec![segment];
    }
    let weights: Vec<u64> = words
        .iter()
        .map(|word| word.chars().count().max(1) as u64)
        .collect();
    let total_weight = weights.iter().sum::<u64>().max(1);
    let mut elapsed_weight = 0;
    words
        .iter()
        .zip(weights.iter())
        .enumerate()
        .map(|(index, (word, weight))| {
            let start = segment.start_ms + duration * elapsed_weight / total_weight;
            elapsed_weight += *weight;
            let end = if index + 1 == words.len() {
                segment.end_ms
            } else {
                segment.start_ms + duration * elapsed_weight / total_weight
            };
            TranscriptSegment {
                start_ms: start,
                end_ms: end.max(start + 1),
                text: (*word).to_string(),
            }
        })
        .collect()
}

fn token_segments_from_value(v: &Value) -> Vec<TranscriptSegment> {
    v.get("tokens")
        .and_then(Value::as_array)
        .map(|tokens| tokens.iter().filter_map(segment_from_token).collect())
        .unwrap_or_default()
}

fn segment_from_token(v: &Value) -> Option<TranscriptSegment> {
    let text = clean_token_text(v.get("text")?.as_str()?);
    if text.is_empty() {
        return None;
    }
    let offsets = v.get("offsets")?;
    let start_ms = offsets.get("from")?.as_u64()?;
    let end_ms = offsets.get("to")?.as_u64()?;
    if end_ms <= start_ms {
        return None;
    }
    Some(TranscriptSegment {
        start_ms,
        end_ms,
        text,
    })
}

fn clean_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clean_token_text(text: &str) -> String {
    let text = text.trim();
    if text.starts_with('[') && text.ends_with(']') {
        String::new()
    } else {
        text.to_string()
    }
}

fn group_segments(segments: &[TranscriptSegment]) -> Vec<TranscriptBlock> {
    let mut blocks = Vec::new();
    let mut current: Option<TranscriptBlock> = None;
    for segment in segments {
        if should_start_block(current.as_ref(), segment) {
            if let Some(block) = current.take() {
                blocks.push(block);
            }
        }
        match &mut current {
            Some(block) => {
                block.end_ms = segment.end_ms;
                append_text(&mut block.text, &segment.text);
            }
            None => {
                current = Some(TranscriptBlock {
                    start_ms: segment.start_ms,
                    end_ms: segment.end_ms,
                    text: segment.text.clone(),
                });
            }
        }
    }
    if let Some(block) = current {
        blocks.push(block);
    }
    blocks
}

fn should_start_block(current: Option<&TranscriptBlock>, next: &TranscriptSegment) -> bool {
    let Some(current) = current else {
        return false;
    };
    next.start_ms.saturating_sub(current.end_ms) > BLOCK_PAUSE_MS
        || (current.text.len() >= BLOCK_MAX_CHARS
            && !is_word_fragment_boundary(&current.text, &next.text))
        || (current.text.len() >= BLOCK_TARGET_CHARS && ends_sentence(&current.text))
}

fn is_word_fragment_boundary(current: &str, next: &str) -> bool {
    let Some(last) = current
        .split_whitespace()
        .last()
        .map(trim_word_edge)
    else {
        return false;
    };
    let next = trim_word_edge(next);
    if next.is_empty() || last.is_empty() {
        return false;
    }
    (is_short_lower_word(last) || is_short_lower_word(next)) && last_is_joinable(current)
}

fn trim_word_edge(word: &str) -> &str {
    word.trim_matches(|c: char| c.is_ascii_punctuation())
}

fn is_short_lower_word(word: &str) -> bool {
    word.chars().count() <= 3
        && word
            .chars()
            .all(|c| c.is_ascii_alphabetic() && c.is_ascii_lowercase())
}

fn last_is_joinable(text: &str) -> bool {
    text.chars()
        .rev()
        .find(|c| !c.is_whitespace())
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '-')
}

fn append_text(out: &mut String, next: &str) {
    if out.is_empty() || is_closing_punctuation(next) {
        out.push_str(next);
    } else if out.ends_with(['.', '!', '?', ':']) {
        out.push_str("\n\n");
        out.push_str(next);
    } else {
        out.push(' ');
        out.push_str(next);
    }
}

fn ends_sentence(text: &str) -> bool {
    let trimmed = text.trim_end();
    trimmed.ends_with('.') || trimmed.ends_with('!') || trimmed.ends_with('?')
}

fn is_closing_punctuation(text: &str) -> bool {
    matches!(
        text,
        "." | "," | ";" | ":" | "!" | "?" | ")" | "]" | "}" | "..."
    )
}

fn render_markdown(
    title: &str,
    url: &str,
    language: &str,
    segments: &[TranscriptSegment],
) -> String {
    let blocks = group_segments(segments);
    let mut out = format!("# {title}\n\nSource: {url}\nLanguage: {language}\n\n");
    for block in blocks {
        out.push_str(&format!(
            "## {} - {}\n\n{}\n\n",
            timestamp(block.start_ms),
            timestamp(block.end_ms),
            block.text
        ));
    }
    out
}

fn timestamp(ms: u64) -> String {
    let total = ms / 1000;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;
    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

fn write_markdown(path: &Path, text: &str) -> Result<(), String> {
    std::fs::write(path, text).map_err(|e| format!("save transcript failed: {e}"))
}

fn cleanup_temp(audio: &Path, json: &Path) {
    let _ = std::fs::remove_file(audio);
    let _ = std::fs::remove_file(json);
    if let Some(parent) = audio.parent() {
        let _ = std::fs::remove_dir(parent);
    }
}

/// Download the best available audio for a link, transcribe it locally with
/// Whisper, and save an organized Markdown transcript to Downloads. The temporary
/// audio and intermediate Whisper JSON are deleted after the run.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn transcribe_link(
    app: AppHandle,
    url: String,
    model: String,
    language: Option<String>,
    on_download_progress: Channel<DownloadProgress>,
    on_transcribe_progress: Channel<TranscribeProgress>,
    state: State<'_, TranscribeState>,
) -> Result<LinkTranscribeResult, String> {
    let url = url.trim().to_string();
    validate_url(&url)?;
    ensure_transcription_model_ready(&app, &model)?;

    let audio = download_audio(&app, url.clone(), &on_download_progress).await?;
    let title = title_from_audio(&audio);
    let json_base = audio.with_file_name("toolzy-transcript");
    let _ = on_transcribe_progress.send(TranscribeProgress { percent: 0.0 });
    let result = transcribe_path_to_base(
        app.clone(),
        audio.to_string_lossy().to_string(),
        json_base.clone(),
        model,
        language,
        Some("transcribe".into()),
        Some("jsonFull".into()),
        on_transcribe_progress,
        &state.child,
    )
    .await;

    let json_path = json_base.with_extension("json");
    let transcript = match result {
        Ok(t) => t,
        Err(e) => {
            cleanup_temp(&audio, &json_path);
            return Err(e);
        }
    };
    let segments = parse_segments(&transcript.text);
    cleanup_temp(&audio, &json_path);
    let segments = segments?;
    let markdown = render_markdown(&title, &url, &transcript.language, &segments);
    let downloads = app.path().download_dir().map_err(|e| e.to_string())?;
    let md_path = output_base(&downloads, &title).with_extension("md");
    write_markdown(&md_path, &markdown)?;

    Ok(LinkTranscribeResult {
        title,
        source_url: url,
        text: markdown,
        output_path: md_path.to_string_lossy().into_owned(),
        language: transcript.language,
        segment_count: segments.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_args_request_best_audio_only() {
        let args =
            build_audio_download_args("out".into(), Some(Path::new("/bin")), "https://x".into());
        assert!(args
            .windows(2)
            .any(|w| w[0] == "-f" && w[1] == "ba/bestaudio/best"));
        assert!(args.contains(&"--windows-filenames".to_string()));
        assert!(args.contains(&"--ffmpeg-location".to_string()));
        assert!(args.iter().any(|s| s.contains("download:PROG|")));
    }

    #[test]
    fn parse_segments_reads_whisper_json() {
        let json = r#"{
            "result": {"language": "pt"},
            "transcription": [
                {"offsets": {"from": 720, "to": 8880}, "text": " Ola, mundo. "},
                {"offsets": {"from": 9200, "to": 11000}, "text": " Tudo bem? "}
            ]
        }"#;
        let segments = parse_segments(json).unwrap();
        assert_eq!(segments.len(), 4);
        assert_eq!(segments[0].start_ms, 720);
        assert_eq!(segments[0].text, "Ola,");
        assert_eq!(segments[1].text, "mundo.");
        assert_eq!(segments[2].text, "Tudo");
    }

    #[test]
    fn parse_segments_prefers_word_tokens_when_available() {
        let json = r#"{
            "transcription": [{
                "offsets": {"from": 0, "to": 2000},
                "text": " Hello, world.",
                "tokens": [
                    {"offsets": {"from": 0, "to": 0}, "text": "[_BEG_]"},
                    {"offsets": {"from": 100, "to": 500}, "text": " Hello"},
                    {"offsets": {"from": 500, "to": 600}, "text": ","},
                    {"offsets": {"from": 700, "to": 1200}, "text": " world"}
                ]
            }]
        }"#;
        let segments = parse_segments(json).unwrap();
        assert_eq!(segments.len(), 3);
        assert_eq!(segments[0].text, "Hello");
        assert_eq!(segments[1].text, ",");
    }

    #[test]
    fn split_segment_by_words_estimates_word_offsets() {
        let segments = split_segment_by_words(TranscriptSegment {
            start_ms: 10_000,
            end_ms: 20_000,
            text: "Question finished. Yes answer starts.".into(),
        });
        assert_eq!(segments.len(), 5);
        assert_eq!(segments[0].start_ms, 10_000);
        assert_eq!(segments.last().unwrap().end_ms, 20_000);
        assert!(segments
            .windows(2)
            .all(|pair| pair[0].end_ms <= pair[1].start_ms));
    }

    #[test]
    fn group_segments_splits_on_long_pause() {
        let segments = vec![
            TranscriptSegment {
                start_ms: 0,
                end_ms: 1000,
                text: "First.".into(),
            },
            TranscriptSegment {
                start_ms: 1200,
                end_ms: 2000,
                text: "Still first.".into(),
            },
            TranscriptSegment {
                start_ms: 6000,
                end_ms: 7000,
                text: "Second.".into(),
            },
        ];
        let blocks = group_segments(&segments);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].start_ms, 0);
        assert_eq!(blocks[1].start_ms, 6000);
    }

    #[test]
    fn group_segments_splits_after_large_sentence() {
        let long_sentence = "word ".repeat(110) + ".";
        let segments = vec![
            TranscriptSegment {
                start_ms: 0,
                end_ms: 30_000,
                text: long_sentence,
            },
            TranscriptSegment {
                start_ms: 30_200,
                end_ms: 31_000,
                text: "Next".into(),
            },
        ];
        let blocks = group_segments(&segments);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[1].text, "Next");
    }

    #[test]
    fn group_segments_avoids_leading_word_fragments() {
        let long_text = "word ".repeat(180) + "function";
        let segments = vec![
            TranscriptSegment {
                start_ms: 0,
                end_ms: 60_000,
                text: long_text,
            },
            TranscriptSegment {
                start_ms: 60_000,
                end_ms: 60_500,
                text: "al".into(),
            },
            TranscriptSegment {
                start_ms: 60_500,
                end_ms: 61_000,
                text: "teams".into(),
            },
            TranscriptSegment {
                start_ms: 61_000,
                end_ms: 61_500,
                text: "such".into(),
            },
        ];
        let blocks = group_segments(&segments);
        assert_eq!(blocks.len(), 2);
        assert!(blocks[0].text.ends_with("function al teams"));
        assert_eq!(blocks[1].text, "such");
    }

    #[test]
    fn append_text_keeps_punctuation_tight() {
        let mut text = "Hello".to_string();
        append_text(&mut text, ",");
        append_text(&mut text, "world");
        append_text(&mut text, ".");
        assert_eq!(text, "Hello, world.");
    }

    #[test]
    fn render_markdown_includes_metadata_and_timestamps() {
        let segments = vec![TranscriptSegment {
            start_ms: 0,
            end_ms: 61_000,
            text: "Hello.".into(),
        }];
        let md = render_markdown("Demo", "https://example.test", "en", &segments);
        assert!(md.contains("# Demo"));
        assert!(md.contains("Source: https://example.test"));
        assert!(md.contains("Language: en"));
        assert!(md.contains("## 00:00 - 01:01"));
    }

    #[test]
    fn render_markdown_never_includes_speaker_labels() {
        let segments = vec![TranscriptSegment {
            start_ms: 0,
            end_ms: 1000,
            text: "Hello.".into(),
        }];
        let md = render_markdown("Demo", "https://example.test", "en", &segments);
        assert!(!md.contains("Speaker labels:"));
        assert!(!md.contains(" - Speaker "));
        assert!(md.contains("## 00:00 - 00:01"));
    }

    #[test]
    fn timestamp_uses_hours_when_needed() {
        assert_eq!(timestamp(65_000), "01:05");
        assert_eq!(timestamp(3_665_000), "01:01:05");
    }
}
