use std::path::Path;

use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};

mod download;
mod image_convert;
mod media;
mod pdf;
mod pdf_build;

/// Resize request from the UI. `mode`: "none" | "px" | "percent".
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeOpt {
    pub mode: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub percent: Option<f32>,
    #[serde(default)]
    pub keep_aspect_ratio: bool,
}

/// Result of a successful conversion, with sizes for a before/after delta.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertResult {
    pub path: String,
    pub in_bytes: u64,
    pub out_bytes: u64,
}

/// Convert an image file on disk to `target` natively and return the saved path +
/// byte sizes. Heavy work runs in Rust — no WASM, no browser memory limits.
///
/// Targets: png, jpg, webp, gif, bmp, tiff. `quality` (1..100) applies to the
/// lossy targets (jpg, webp).
#[tauri::command]
fn convert_image(
    path: String,
    target: String,
    quality: Option<u8>,
    resize: Option<ResizeOpt>,
) -> Result<ConvertResult, String> {
    let src = Path::new(&path);
    let in_bytes = std::fs::metadata(src).map(|m| m.len()).unwrap_or(0);

    let mut img: DynamicImage = ImageReader::open(src)
        .map_err(|e| format!("open failed: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("read failed: {e}"))?
        .decode()
        .map_err(|e| format!("decode failed: {e}"))?;

    if let Some(r) = resize.filter(|r| r.mode != "none") {
        let (w, h) = image_convert::target_dimensions(img.width(), img.height(), &r);
        img = img.resize_exact(w, h, FilterType::Lanczos3);
    }

    let out = image_convert::output_path(src, &target);
    encode(&img, &target, quality, &out)?;
    let out_bytes = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);

    Ok(ConvertResult {
        path: out.to_string_lossy().to_string(),
        in_bytes,
        out_bytes,
    })
}

/// Encode `img` to `target`. JPEG/WebP honor `quality` (1..100); JPEG drops alpha.
fn encode(img: &DynamicImage, target: &str, quality: Option<u8>, out: &Path) -> Result<(), String> {
    match target {
        "jpg" => {
            let q = quality.unwrap_or(80).clamp(1, 100);
            let rgb = img.to_rgb8(); // JPEG has no alpha channel
            let mut file =
                std::io::BufWriter::new(std::fs::File::create(out).map_err(|e| e.to_string())?);
            let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, q);
            enc.encode_image(&rgb).map_err(|e| format!("encode failed: {e}"))
        }
        "webp" => {
            let q = f32::from(quality.unwrap_or(80).clamp(1, 100));
            let rgba = img.to_rgba8();
            let data = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height()).encode(q);
            std::fs::write(out, &*data).map_err(|e| format!("encode failed: {e}"))
        }
        "png" => save(img, ImageFormat::Png, out),
        "gif" => save(img, ImageFormat::Gif, out),
        "bmp" => save(img, ImageFormat::Bmp, out),
        "tiff" => save(img, ImageFormat::Tiff, out),
        other => Err(format!("unsupported target: {other}")),
    }
}

fn save(img: &DynamicImage, format: ImageFormat, out: &Path) -> Result<(), String> {
    img.save_with_format(out, format)
        .map_err(|e| format!("encode failed: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            convert_image,
            pdf::pdf_to_images,
            pdf_build::images_to_pdf,
            media::convert_media,
            download::probe_media,
            download::download_media
        ])
        .run(tauri::generate_context!())
        .expect("error while running Toolzy");
}
