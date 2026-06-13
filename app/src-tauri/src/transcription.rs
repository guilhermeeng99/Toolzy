//! Local speech-to-text with the bundled **whisper-cli** sidecar. Priority is a
//! *faithful* transcript, not speed: every run preprocesses to 16 kHz mono WAV
//! (ffmpeg) and recognizes with fixed **anti-hallucination** settings — Silero VAD
//! (only speech reaches Whisper, so silence can't become invented text), greedy
//! decoding with no temperature fallback, and no previous-text conditioning (stops
//! repetition loops). Models are large (466 MB–3 GB), so they download on demand to
//! the app-data dir and are reused. See docs/specs/transcription.md.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::download::DownloadProgress;
use crate::ffmpeg::run_ffmpeg;

/// Where Whisper ggml models are fetched from (one resolve URL per file).
const HF_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
/// Silero VAD model (small) — required for the silence-gating that prevents
/// hallucination. Lives in its own HF repo.
const VAD_FILENAME: &str = "ggml-silero-v6.2.0.bin";
const VAD_URL: &str =
    "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin";
/// Self-contained NVIDIA (CUDA 12.4) whisper.cpp build — bundles the cuBLAS DLLs, so it
/// needs only an NVIDIA driver. Downloaded on demand (~435 MB) for ~7–10× speed on
/// 1–2 min clips; the small CPU build stays the bundled default.
const GPU_URL: &str =
    "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip";

/// A model offered in the UI. `size_mb` is approximate (drives the "~N GB" gate).
struct ModelDef {
    id: &'static str,
    label: &'static str,
    size_mb: u32,
}

/// Curated list — `large-v3` is the default (max fidelity); turbo is the faster,
/// slightly-less-faithful option. tiny/base are omitted (too low-fidelity).
const MODELS: &[ModelDef] = &[
    ModelDef {
        id: "small",
        label: "Small",
        size_mb: 466,
    },
    ModelDef {
        id: "medium",
        label: "Medium",
        size_mb: 1500,
    },
    ModelDef {
        id: "large-v3-turbo",
        label: "Large v3 Turbo",
        size_mb: 1600,
    },
    ModelDef {
        id: "large-v3",
        label: "Large v3 (max fidelity)",
        size_mb: 3100,
    },
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModel {
    id: String,
    label: String,
    size_mb: u32,
    downloaded: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResult {
    pub text: String,        // transcript read back for the UI preview
    pub output_path: String, // saved file beside the input
    pub language: String,    // forced, or auto-detected from whisper output
}

/// Live recognition progress (0–100) streamed to the UI via a Channel, parsed from
/// whisper-cli's `--print-progress` output.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeProgress {
    pub percent: f64,
}

/// Holds the running whisper-cli child so `cancel_transcription` can kill it. Only
/// one transcription runs at a time (the UI hides the button while busy).
#[derive(Default)]
pub struct TranscribeState {
    pub(crate) child: Mutex<Option<CommandChild>>,
}

/// Whether an NVIDIA GPU is present and whether the optional GPU engine is installed.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuStatus {
    gpu_present: bool,
    downloaded: bool,
}

/// `ggml-<id>.bin` for a known model id, else `None` (unknown id).
fn model_filename(id: &str) -> Option<String> {
    MODELS
        .iter()
        .find(|m| m.id == id)
        .map(|_| format!("ggml-{id}.bin"))
}

/// HF resolve URL for a known model id, else `None`.
fn model_url(id: &str) -> Option<String> {
    model_filename(id).map(|f| format!("{HF_BASE}/{f}"))
}

/// The output extension for a format, or `None` for an unsupported format.
fn format_ext(format: &str) -> Option<&'static str> {
    match format {
        "txt" => Some("txt"),
        "srt" => Some("srt"),
        "vtt" => Some("vtt"),
        "json" => Some("json"),
        "jsonFull" => Some("json"),
        _ => None,
    }
}

/// Transcript path beside the input: `clip.mp3` + `srt` → `clip.srt`. `None` for an
/// unknown format. Pure → unit-tested. (Named apart from `image_convert::output_path`.)
fn transcript_output_path(src: &Path, format: &str) -> Option<PathBuf> {
    format_ext(format).map(|ext| src.with_extension(ext))
}

/// Build the whisper-cli args. Always emits the fixed anti-hallucination flags (VAD,
/// greedy, no-fallback, no previous-text context); `-of` is the input's base path so
/// output lands beside the input. Pure → unit-tested.
#[allow(clippy::too_many_arguments)]
fn whisper_args(
    wav: &Path,
    model: &Path,
    vad_model: &Path,
    out_base: &Path,
    language: Option<&str>,
    task: &str,
    format: &str,
    threads: usize,
) -> Vec<String> {
    let mut args = vec![
        "-m".into(),
        model.to_string_lossy().into_owned(),
        "-f".into(),
        wav.to_string_lossy().into_owned(),
        "-l".into(),
        language.unwrap_or("auto").to_string(),
        "-t".into(),
        threads.to_string(), // use all cores (default is 4)
        // Anti-hallucination (fixed, not user-tunable):
        "--vad".into(), // gate silence with VAD
        "--vad-model".into(),
        vad_model.to_string_lossy().into_owned(),
        "--temperature".into(),
        "0".into(),             // greedy, deterministic
        "--no-fallback".into(), // no temperature ladder
        "--max-context".into(),
        "0".into(),                // no previous-text drift
        "--print-progress".into(), // emit `progress = N%` for the UI bar
        "-of".into(),
        out_base.to_string_lossy().into_owned(),
    ];
    if format == "jsonFull" {
        args.extend(["-ml".into(), "60".into(), "-sow".into()]);
    }
    if task == "translate" {
        args.push("--translate".into());
    }
    args.push(match format {
        "srt" => "-osrt".into(),
        "vtt" => "-ovtt".into(),
        "jsonFull" => "-ojf".into(),
        "json" => "-oj".into(),
        _ => "-otxt".into(),
    });
    args
}

/// whisper-cli prints `auto-detected language: <code>` to stderr; pull the code out.
/// Pure → unit-tested. `None` when the line is absent (e.g. a forced language).
fn detected_language(stderr: &str) -> Option<String> {
    let after = stderr.split("auto-detected language:").nth(1)?;
    after.split_whitespace().next().map(str::to_string)
}

/// whisper-cli (`--print-progress`) prints `… progress =  N%`; pull N (0–100) out.
/// Pure → unit-tested. `None` for non-progress lines.
fn parse_whisper_progress(line: &str) -> Option<f64> {
    let after = line.split("progress =").nth(1)?;
    after
        .trim()
        .trim_end_matches('%')
        .trim()
        .parse::<f64>()
        .ok()
}

/// App-data subdir holding the downloaded models + the VAD model.
fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models"))
}

/// Resolve a model to its on-disk path, erroring if unknown or not yet downloaded.
fn require_model(app: &AppHandle, model: &str) -> Result<PathBuf, String> {
    let filename = model_filename(model).ok_or_else(|| format!("unknown model: {model}"))?;
    let path = models_dir(app)?.join(filename);
    if path.exists() {
        Ok(path)
    } else {
        Err(format!("model not downloaded: {model}"))
    }
}

pub(crate) fn ensure_transcription_model_ready(app: &AppHandle, model: &str) -> Result<(), String> {
    let _ = require_model(app, model)?;
    let vad_path = models_dir(app)?.join(VAD_FILENAME);
    if vad_path.exists() {
        Ok(())
    } else {
        Err("model not downloaded: silero VAD".into())
    }
}

/// The deterministic stem of the temp WAV name (the input's file stem, or "audio"
/// when the path has none). Split out so it's unit-testable apart from the nanos
/// suffix below. Pure → unit-tested.
fn wav_stem(input: &Path) -> &str {
    input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio")
}

/// A unique temp WAV path for the 16 kHz mono intermediate.
fn temp_wav_path(input: &Path) -> PathBuf {
    let stem = wav_stem(input);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("toolzy-{stem}-{nanos}.wav"))
}

/// ffmpeg → 16 kHz mono `pcm_s16le` WAV, the input Whisper requires. Needs the
/// ffmpeg sidecar.
async fn preprocess_to_wav(app: &AppHandle, input: &str, wav: &Path) -> Result<(), String> {
    run_ffmpeg(
        app,
        vec![
            "-y".into(),
            "-i".into(),
            input.to_string(),
            "-ar".into(),
            "16000".into(),
            "-ac".into(),
            "1".into(),
            "-c:a".into(),
            "pcm_s16le".into(),
            wav.to_string_lossy().into_owned(),
        ],
    )
    .await
}

/// Forward whisper-cli progress lines in a chunk to `on_progress`; append the rest
/// to `log` (kept for language detection) and remember the last non-empty line for
/// the error message. Keeps `run_whisper`'s event loop flat.
fn drain_whisper(
    bytes: &[u8],
    on_progress: &Channel<TranscribeProgress>,
    log: &mut String,
    error_tail: &mut String,
) {
    for line in String::from_utf8_lossy(bytes).lines() {
        if let Some(percent) = parse_whisper_progress(line) {
            let _ = on_progress.send(TranscribeProgress { percent });
            continue;
        }
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            *error_tail = trimmed.to_string();
        }
        log.push_str(line);
        log.push('\n');
    }
}

/// Run whisper-cli, streaming `--print-progress` percentages to `on_progress` as they
/// arrive. Returns the collected stderr log (for language detection) or the stderr
/// tail as an error. Needs the whisper-cli sidecar.
async fn run_whisper(
    app: &AppHandle,
    args: Vec<String>,
    on_progress: &Channel<TranscribeProgress>,
    child_slot: &Mutex<Option<CommandChild>>,
) -> Result<String, String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("whisper-cli")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;
    // so cancel_transcription can kill it
    *child_slot
        .lock()
        .map_err(|_| "transcription state lock poisoned".to_string())? = Some(child);

    let mut log = String::new();
    let mut error_tail = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            // Progress can surface on either stream; everything else (incl. the
            // detected-language line) is kept for the result / error message.
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                drain_whisper(&bytes, on_progress, &mut log, &mut error_tail);
            }
            CommandEvent::Terminated(payload) if payload.code != Some(0) => {
                let reason = if error_tail.is_empty() {
                    "unknown error"
                } else {
                    &error_tail
                };
                return Err(format!("transcription failed. {reason}"));
            }
            _ => {}
        }
    }
    Ok(log)
}

/// Stream a URL to `dest` via a `.part` file renamed on completion (so an
/// interrupted download leaves no half model). Blocking — call inside spawn_blocking.
pub(crate) fn download_file(
    url: &str,
    dest: &Path,
    progress: Option<&Channel<DownloadProgress>>,
) -> Result<(), String> {
    // ureq 3: headers come from the `http` crate (case-insensitive keys), and the
    // body is read via `into_body().into_reader()` (the old `.into_reader()` is gone).
    let resp = ureq::get(url)
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let total: Option<u64> = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok());

    let part = dest.with_extension("part");
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    let mut reader = resp.into_body().into_reader();
    let mut buf = [0u8; 65536];
    let mut downloaded = 0u64;

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        if let Some(ch) = progress {
            let percent = match total {
                Some(t) if t > 0 => downloaded as f64 / t as f64 * 100.0,
                _ => 0.0,
            };
            let _ = ch.send(DownloadProgress {
                percent,
                downloaded,
                total,
            });
        }
    }

    drop(file);
    std::fs::rename(&part, dest).map_err(|e| e.to_string())
}

/// List the offered models, flagging which are already installed (drives the UI
/// picker + download gate).
#[tauri::command]
pub fn list_whisper_models(app: AppHandle) -> Result<Vec<WhisperModel>, String> {
    let dir = models_dir(&app)?;
    Ok(MODELS
        .iter()
        .map(|m| WhisperModel {
            id: m.id.into(),
            label: m.label.into(),
            size_mb: m.size_mb,
            downloaded: dir.join(format!("ggml-{}.bin", m.id)).exists(),
        })
        .collect())
}

/// Download a model (and the small Silero VAD model, once) into the app-data dir,
/// streaming progress to the UI. Reuses an already-installed model. Returns the model
/// path. The only network use here is to Hugging Face for the model files.
#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    model: String,
    on_progress: Channel<DownloadProgress>,
) -> Result<String, String> {
    let url = model_url(&model).ok_or_else(|| format!("unknown model: {model}"))?;
    let filename = model_filename(&model).ok_or_else(|| format!("unknown model: {model}"))?;
    let dir = models_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let dest = dir.join(&filename);
    let vad_path = dir.join(VAD_FILENAME);
    let dest_str = dest.to_string_lossy().into_owned();
    if dest.exists() && vad_path.exists() {
        return Ok(dest_str); // already installed
    }

    // ureq is blocking; keep it off the async runtime. The big model reports
    // progress; the tiny VAD model downloads quietly first if missing.
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        if !vad_path.exists() {
            download_file(VAD_URL, &vad_path, None)?;
        }
        if !dest.exists() {
            download_file(&url, &dest, Some(&on_progress))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(dest_str)
}

// ---- GPU engine (optional, NVIDIA) -----------------------------------------

/// Dir holding the downloaded GPU engine (whisper-cli.exe + CUDA DLLs).
fn gpu_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("engine-cuda"))
}

fn gpu_exe(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(gpu_dir(app)?.join("whisper-cli.exe"))
}

/// True when an NVIDIA driver is present (nvcuda.dll) — the GPU engine only helps then.
fn nvidia_present() -> bool {
    #[cfg(windows)]
    {
        let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        Path::new(&root)
            .join("System32")
            .join("nvcuda.dll")
            .exists()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Recursively find the first file named `name` under `dir`.
pub(crate) fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Some(hit) = find_file(&p, name) {
                return Some(hit);
            }
        } else if p.file_name().and_then(|n| n.to_str()) == Some(name) {
            return Some(p);
        }
    }
    None
}

/// Extract `zip` into a fresh `tmp` dir. Uses the platform `tar` — on Windows that is
/// bsdtar (ships with Windows 10+), which also unpacks `.zip`, so no extra crate.
pub(crate) fn extract_archive(archive: &Path, tmp: &Path) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(tmp);
    std::fs::create_dir_all(tmp).map_err(|e| e.to_string())?;
    let ok = std::process::Command::new("tar")
        .args([
            "-xf",
            &archive.to_string_lossy(),
            "-C",
            &tmp.to_string_lossy(),
        ])
        .status()
        .map_err(|e| format!("extract failed: {e}"))?
        .success();
    if ok {
        Ok(())
    } else {
        Err("extract failed".into())
    }
}

/// Copy the engine's `whisper-cli.exe` + its sibling DLLs from the extracted tree
/// (located by finding the exe) into `dest`.
fn copy_engine_files(extracted: &Path, dest: &Path) -> Result<(), String> {
    let exe = find_file(extracted, "whisper-cli.exe").ok_or("whisper-cli.exe not in archive")?;
    let src = exe.parent().ok_or("bad archive layout")?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name();
        let keep = name
            .to_str()
            .is_some_and(|n| n == "whisper-cli.exe" || n.to_ascii_lowercase().ends_with(".dll"));
        if keep {
            std::fs::copy(entry.path(), dest.join(&name)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Download + extract the GPU build into `dir` (keeping whisper-cli.exe + its DLLs).
fn install_gpu_engine(dir: &Path, on_progress: &Channel<DownloadProgress>) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let zip = dir.join("engine.zip");
    download_file(GPU_URL, &zip, Some(on_progress))?;

    let tmp = dir.join("extract");
    extract_archive(&zip, &tmp)?;
    copy_engine_files(&tmp, dir)?;

    let _ = std::fs::remove_dir_all(&tmp);
    let _ = std::fs::remove_file(&zip);
    Ok(())
}

/// Run the downloaded GPU engine via a plain process (it's outside the sidecar
/// allow-list). GPU runs are fast, so progress isn't streamed. Returns its stderr log.
fn run_gpu_blocking(exe: &Path, args: &[String]) -> Result<String, String> {
    let mut cmd = std::process::Command::new(exe);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW — no console flash
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    let log = String::from_utf8_lossy(&output.stderr).into_owned();
    if output.status.success() {
        Ok(log)
    } else {
        Err(format!(
            "transcription failed. {}",
            log.lines().last().unwrap_or("unknown error")
        ))
    }
}

/// Recognize speech: the installed GPU engine (≈7–10× faster on 1–2 min clips, no
/// streamed progress) when present, else the bundled CPU sidecar (streams progress +
/// supports Cancel). Clears the cancel slot when the child finishes or is killed.
/// Returns the stderr log (for language detection) or the failure tail.
async fn recognize(
    app: &AppHandle,
    args: Vec<String>,
    on_progress: &Channel<TranscribeProgress>,
    child_slot: &Mutex<Option<CommandChild>>,
) -> Result<String, String> {
    let gpu = gpu_exe(app)?;
    let recognized = if gpu.exists() {
        let gpu_args = args.clone();
        tauri::async_runtime::spawn_blocking(move || run_gpu_blocking(&gpu, &gpu_args))
            .await
            .map_err(|e| e.to_string())?
    } else {
        run_whisper(app, args, on_progress, child_slot).await
    };
    *child_slot
        .lock()
        .map_err(|_| "transcription state lock poisoned".to_string())? = None;
    recognized
}

/// Whether an NVIDIA GPU is present and whether the GPU engine is installed.
#[tauri::command]
pub fn gpu_engine_status(app: AppHandle) -> Result<GpuStatus, String> {
    Ok(GpuStatus {
        gpu_present: nvidia_present(),
        downloaded: gpu_exe(&app)?.exists(),
    })
}

/// Download the self-contained NVIDIA (CUDA) engine on demand, streaming progress.
/// No-op when already installed.
#[tauri::command]
pub async fn download_gpu_engine(
    app: AppHandle,
    on_progress: Channel<DownloadProgress>,
) -> Result<(), String> {
    if gpu_exe(&app)?.exists() {
        return Ok(());
    }
    let dir = gpu_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || install_gpu_engine(&dir, &on_progress))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

/// Read the transcript written beside the input and resolve the language label:
/// the forced language, else whisper's auto-detected code, else "auto".
fn build_result(out: &Path, forced_language: Option<String>, stderr: &str) -> TranscribeResult {
    let text = std::fs::read_to_string(out).unwrap_or_default();
    let language = forced_language
        .unwrap_or_else(|| detected_language(stderr).unwrap_or_else(|| "auto".into()));
    TranscribeResult {
        text,
        output_path: out.to_string_lossy().into_owned(),
        language,
    }
}

/// Transcribe (or translate→English) a media file to text beside the input. Faithful
/// by design — see the module docs. Needs the ffmpeg + whisper-cli sidecars and the
/// chosen model already downloaded.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn transcribe_path_to_base(
    app: AppHandle,
    path: String,
    out_base: PathBuf,
    model: String,
    language: Option<String>,
    task: Option<String>,
    format: Option<String>,
    on_progress: Channel<TranscribeProgress>,
    child_slot: &Mutex<Option<CommandChild>>,
) -> Result<TranscribeResult, String> {
    let task = task.unwrap_or_else(|| "transcribe".into());
    let format = format.unwrap_or_else(|| "txt".into());
    if task != "transcribe" && task != "translate" {
        return Err(format!("unknown task: {task}"));
    }
    let src = Path::new(&path);
    let out = format_ext(&format)
        .map(|ext| out_base.with_extension(ext))
        .ok_or_else(|| format!("unknown format: {format}"))?;
    let model_path = require_model(&app, &model)?;
    let vad_path = models_dir(&app)?.join(VAD_FILENAME);
    if !vad_path.exists() {
        return Err("model not downloaded: silero VAD".into());
    }

    let wav = temp_wav_path(src);
    if let Err(e) = preprocess_to_wav(&app, &path, &wav).await {
        let _ = std::fs::remove_file(&wav);
        return Err(e);
    }

    // Use all available cores — the large-v3 encoder is CPU-bound and whisper-cli
    // otherwise defaults to only 4 threads.
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let args = whisper_args(
        &wav,
        &model_path,
        &vad_path,
        &out_base,
        language.as_deref(),
        &task,
        &format,
        threads,
    );
    let recognized = recognize(&app, args, &on_progress, child_slot).await;
    let _ = std::fs::remove_file(&wav); // always clean up the temp WAV (success or error)
    let stderr = recognized?;
    Ok(build_result(&out, language, &stderr))
}

/// Transcribe (or translate->English) a media file to text beside the input.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    path: String,
    model: String,
    language: Option<String>,
    task: Option<String>,
    format: Option<String>,
    on_progress: Channel<TranscribeProgress>,
    state: State<'_, TranscribeState>,
) -> Result<TranscribeResult, String> {
    let selected_format = format.as_deref().unwrap_or("txt");
    let out_base = transcript_output_path(Path::new(&path), selected_format)
        .map(|p| p.with_extension(""))
        .unwrap_or_else(|| Path::new(&path).with_extension(""));
    transcribe_path_to_base(
        app,
        path,
        out_base,
        model,
        language,
        task,
        format,
        on_progress,
        &state.child,
    )
    .await
}

/// Kill the in-flight transcription, if any (the UI Cancel button). No-op when idle.
#[tauri::command]
pub fn cancel_transcription(state: State<'_, TranscribeState>) -> Result<(), String> {
    let child = state
        .child
        .lock()
        .map_err(|_| "transcription state lock poisoned".to_string())?
        .take();
    if let Some(child) = child {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_url_known_builds_hf_resolve_url() {
        assert_eq!(
            model_url("large-v3").unwrap(),
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin"
        );
    }

    #[test]
    fn model_url_unknown_is_none() {
        assert!(model_url("does-not-exist").is_none());
    }

    #[test]
    fn model_filename_known() {
        assert_eq!(model_filename("medium").unwrap(), "ggml-medium.bin");
    }

    #[test]
    fn wav_stem_uses_filename_or_audio_fallback() {
        assert_eq!(wav_stem(Path::new("/a/clip.mp3")), "clip");
        assert_eq!(wav_stem(Path::new("clip.wav")), "clip");
        assert_eq!(wav_stem(Path::new("")), "audio");
    }

    #[test]
    fn transcript_output_path_swaps_extension_per_format() {
        assert_eq!(
            transcript_output_path(Path::new("/a/clip.mp3"), "srt").unwrap(),
            PathBuf::from("/a/clip.srt")
        );
        assert_eq!(
            transcript_output_path(Path::new("/a/clip.mp3"), "txt").unwrap(),
            PathBuf::from("/a/clip.txt")
        );
        assert_eq!(
            transcript_output_path(Path::new("/a/clip.mp3"), "json").unwrap(),
            PathBuf::from("/a/clip.json")
        );
    }

    #[test]
    fn transcript_output_path_unknown_format_is_none() {
        assert!(transcript_output_path(Path::new("/a/clip.mp3"), "doc").is_none());
    }

    #[test]
    fn whisper_args_always_emits_antihallucination_flags() {
        let a = whisper_args(
            Path::new("a.wav"),
            Path::new("m.bin"),
            Path::new("v.bin"),
            Path::new("out"),
            None,
            "transcribe",
            "txt",
            8,
        );
        for flag in [
            "--vad",
            "--vad-model",
            "--temperature",
            "--no-fallback",
            "--max-context",
            "-otxt",
        ] {
            assert!(a.contains(&flag.to_string()), "missing {flag}");
        }
        assert!(a.windows(2).any(|w| w[0] == "--temperature" && w[1] == "0"));
        assert!(a.windows(2).any(|w| w[0] == "--max-context" && w[1] == "0"));
        assert!(a.windows(2).any(|w| w[0] == "-t" && w[1] == "8"));
        assert!(a.windows(2).any(|w| w[0] == "-l" && w[1] == "auto"));
        assert!(!a.contains(&"--translate".to_string()));
    }

    #[test]
    fn whisper_args_translate_forced_lang_and_format() {
        let a = whisper_args(
            Path::new("a.wav"),
            Path::new("m.bin"),
            Path::new("v.bin"),
            Path::new("out"),
            Some("pt"),
            "translate",
            "srt",
            8,
        );
        assert!(a.contains(&"--translate".to_string()));
        assert!(a.contains(&"-osrt".to_string()));
        assert!(a.windows(2).any(|w| w[0] == "-l" && w[1] == "pt"));
    }

    #[test]
    fn whisper_args_format_flags_match_whisper_cli() {
        // whisper-cli v1.8.4 spellings: -otxt/-ovtt/-osrt, and JSON is -oj (not -ojson).
        let flag = |fmt| {
            whisper_args(
                Path::new("a.wav"),
                Path::new("m"),
                Path::new("v"),
                Path::new("o"),
                None,
                "transcribe",
                fmt,
                8,
            )
            .into_iter()
            .find(|a| a.starts_with("-o") && a.as_str() != "-of")
            .unwrap()
        };
        assert_eq!(flag("vtt"), "-ovtt");
        assert_eq!(flag("json"), "-oj");
    }

    #[test]
    fn detected_language_parses_code() {
        assert_eq!(
            detected_language("whisper_full: auto-detected language: pt (p = 0.98)").as_deref(),
            Some("pt")
        );
        assert!(detected_language("no language line here").is_none());
    }

    #[test]
    fn parse_whisper_progress_reads_percent() {
        assert_eq!(
            parse_whisper_progress("whisper_print_progress_callback: progress =  40%"),
            Some(40.0)
        );
        assert_eq!(
            parse_whisper_progress("[00:00:00.000 --> 00:00:02.000] hi"),
            None
        );
    }

    #[test]
    fn find_file_locates_nested_target() {
        // Mirrors locating whisper-cli.exe inside the extracted GPU-engine archive.
        let base = std::env::temp_dir().join(format!("toolzy-findfile-{}", std::process::id()));
        let nested = base.join("a").join("b");
        std::fs::create_dir_all(&nested).unwrap();
        let target = nested.join("whisper-cli.exe");
        std::fs::write(&target, b"x").unwrap();
        assert_eq!(find_file(&base, "whisper-cli.exe"), Some(target));
        assert!(find_file(&base, "not-there.exe").is_none());
        let _ = std::fs::remove_dir_all(&base);
    }
}
