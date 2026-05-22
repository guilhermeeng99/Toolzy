use std::path::{Path, PathBuf};

use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};

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
pub fn convert_image(
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
        let (w, h) = target_dimensions(img.width(), img.height(), &r);
        img = img.resize_exact(w, h, FilterType::Lanczos3);
    }

    let out = output_path(src, &target);
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

/// Compute output dimensions from the source size and resize options. Mirrors the
/// former TS logic: never below 1px; percent capped at 100 (no silent upscale).
pub fn target_dimensions(w: u32, h: u32, r: &ResizeOpt) -> (u32, u32) {
    match r.mode.as_str() {
        "percent" => {
            let p = r.percent.unwrap_or(100.0).clamp(1.0, 100.0) / 100.0;
            (scale(w, p), scale(h, p))
        }
        "px" if !r.keep_aspect_ratio => (r.width.unwrap_or(w).max(1), r.height.unwrap_or(h).max(1)),
        "px" => fit_keep_aspect(w, h, r.width, r.height),
        _ => (w.max(1), h.max(1)),
    }
}

/// Fit within the given box, preserving aspect ratio (smaller scale wins); if only
/// one dimension is given, derive the other.
fn fit_keep_aspect(w: u32, h: u32, tw: Option<u32>, th: Option<u32>) -> (u32, u32) {
    let (wf, hf) = (w as f32, h as f32);
    match (tw, th) {
        (Some(tw), Some(th)) => {
            let s = (tw as f32 / wf).min(th as f32 / hf);
            (round_min1(wf * s), round_min1(hf * s))
        }
        (Some(tw), None) => (tw.max(1), round_min1(hf * (tw as f32 / wf))),
        (None, Some(th)) => (round_min1(wf * (th as f32 / hf)), th.max(1)),
        (None, None) => (w.max(1), h.max(1)),
    }
}

fn scale(v: u32, f: f32) -> u32 {
    round_min1(v as f32 * f)
}

fn round_min1(v: f32) -> u32 {
    v.round().max(1.0) as u32
}

/// Output path = source directory + base name + new extension.
pub fn output_path(src: &Path, target: &str) -> PathBuf {
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    src.with_file_name(format!("{stem}.{target}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(mode: &str, w: Option<u32>, h: Option<u32>, p: Option<f32>, keep: bool) -> ResizeOpt {
        ResizeOpt {
            mode: mode.into(),
            width: w,
            height: h,
            percent: p,
            keep_aspect_ratio: keep,
        }
    }

    #[test]
    fn percent_scales_and_caps_at_100() {
        assert_eq!(
            target_dimensions(1000, 500, &r("percent", None, None, Some(50.0), true)),
            (500, 250)
        );
        assert_eq!(
            target_dimensions(1000, 500, &r("percent", None, None, Some(200.0), true)),
            (1000, 500)
        );
    }

    #[test]
    fn px_keep_aspect_one_dimension_derives_the_other() {
        assert_eq!(
            target_dimensions(1000, 500, &r("px", Some(500), None, None, true)),
            (500, 250)
        );
    }

    #[test]
    fn px_keep_aspect_both_dimensions_fit_inside_box() {
        assert_eq!(
            target_dimensions(1000, 500, &r("px", Some(400), Some(400), None, true)),
            (400, 200)
        );
    }

    #[test]
    fn px_stretch_exact_without_keep_aspect() {
        assert_eq!(
            target_dimensions(1000, 500, &r("px", Some(300), Some(300), None, false)),
            (300, 300)
        );
    }

    #[test]
    fn never_returns_below_one() {
        assert_eq!(
            target_dimensions(1, 1, &r("percent", None, None, Some(1.0), true)),
            (1, 1)
        );
    }

    #[test]
    fn none_keeps_source_size() {
        assert_eq!(
            target_dimensions(800, 600, &r("none", None, None, None, true)),
            (800, 600)
        );
    }

    #[test]
    fn output_path_swaps_extension() {
        assert_eq!(
            output_path(Path::new("/a/b/photo.png"), "jpg"),
            PathBuf::from("/a/b/photo.jpg")
        );
        assert_eq!(
            output_path(Path::new("/a/b/photo.png"), "webp"),
            PathBuf::from("/a/b/photo.webp")
        );
    }
}
