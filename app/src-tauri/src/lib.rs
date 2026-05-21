use std::path::Path;

use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader};
use serde::Deserialize;

mod image_convert;

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

/// Convert an image file on disk to `target` (png | jpg) natively and return the
/// saved path. Heavy work runs in Rust — no WASM, no browser memory limits.
#[tauri::command]
fn convert_image(
    path: String,
    target: String,
    quality: Option<u8>,
    resize: Option<ResizeOpt>,
) -> Result<String, String> {
    let src = Path::new(&path);
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
    Ok(out.to_string_lossy().to_string())
}

/// Encode `img` to `target`. JPEG honors `quality` (1..100) and drops alpha.
fn encode(img: &DynamicImage, target: &str, quality: Option<u8>, out: &Path) -> Result<(), String> {
    match target {
        "jpg" => {
            let q = quality.unwrap_or(80).clamp(1, 100);
            let rgb = img.to_rgb8(); // JPEG has no alpha channel
            let mut file = std::io::BufWriter::new(
                std::fs::File::create(out).map_err(|e| e.to_string())?,
            );
            let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, q);
            enc.encode_image(&rgb).map_err(|e| format!("encode failed: {e}"))
        }
        "png" => img
            .save_with_format(out, ImageFormat::Png)
            .map_err(|e| format!("encode failed: {e}")),
        other => Err(format!("unsupported target: {other}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![convert_image])
        .run(tauri::generate_context!())
        .expect("error while running Toolzy");
}
