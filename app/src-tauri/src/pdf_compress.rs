use std::io::BufWriter;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::ImageEncoder;
use pdfium_render::prelude::*;
use printpdf::{
    ColorBits, ColorSpace, Image, ImageFilter, ImageTransform, ImageXObject, Mm,
    PdfDocumentReference, PdfLayerIndex, PdfPageIndex, Px,
};
use serde::Serialize;

use crate::pdf::bind_pdfium;

// 1 PDF point -> millimetres. A PDF page is measured in points (72 per inch); we
// rebuild each page at its original physical size.
const MM_PER_PT: f32 = 25.4 / 72.0;

/// Output path + the source / result byte sizes so the UI can show the saving.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressResult {
    pub path: String,
    pub before: u64,
    pub after: u64,
}

/// Render scale (≈ dpi / 72) and JPEG quality per level. Higher level = smaller
/// file, lower fidelity. Unknown levels fall back to `balanced`. Pure → unit-tested.
fn compress_params(level: &str) -> (f32, u8) {
    match level {
        "light" => (2.0, 80),
        "strong" => (1.0, 50),
        _ => (1.5, 65), // balanced (default)
    }
}

/// Shrink a PDF by rasterizing every page (pdfium) at the level's scale and
/// re-embedding it as a JPEG (DCTDecode) in a rebuilt PDF (printpdf). This is
/// **lossy** — text becomes pixels — so it suits scanned / image-heavy PDFs. Each
/// output page keeps the source page's physical size. Returns the path + before/
/// after sizes. Needs the pdfium library (no sidecar).
#[tauri::command]
pub fn compress_pdf(
    app: tauri::AppHandle,
    path: String,
    out_path: String,
    level: String,
) -> Result<CompressResult, String> {
    let (scale, quality) = compress_params(&level);
    let pdfium = bind_pdfium(&app)?;
    let doc = pdfium
        .load_pdf_from_file(Path::new(&path), None)
        .map_err(|e| format!("decode failed: {e}"))?;
    let config = PdfRenderConfig::new().scale_page_by_factor(scale);

    // Build incrementally so only one rendered page is held in memory at a time.
    let mut out: Option<PdfDocumentReference> = None;
    for page in doc.pages().iter() {
        let w_mm = page.width().value * MM_PER_PT;
        let h_mm = page.height().value * MM_PER_PT;
        let rgb = page
            .render_with_config(&config)
            .map_err(|e| format!("decode failed: {e}"))?
            .as_image()
            .into_rgb8();
        let (px_w, px_h) = (rgb.width() as usize, rgb.height() as usize);
        let jpeg = encode_jpeg(&rgb, quality)?;
        // Page is sized from the source; the render scale maps px back at 72*scale dpi.
        let transform = ImageTransform { dpi: Some(72.0 * scale), ..Default::default() };

        match &out {
            None => {
                let (doc_ref, p, l) =
                    printpdf::PdfDocument::new("Toolzy", Mm(w_mm), Mm(h_mm), "Layer 1");
                embed_jpeg(&doc_ref, p, l, px_w, px_h, jpeg, transform);
                out = Some(doc_ref);
            }
            Some(doc_ref) => {
                let (p, l) = doc_ref.add_page(Mm(w_mm), Mm(h_mm), "Layer 1");
                embed_jpeg(doc_ref, p, l, px_w, px_h, jpeg, transform);
            }
        }
    }

    let pdf = out.ok_or("empty pdf")?;
    let file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
    pdf.save(&mut BufWriter::new(file))
        .map_err(|e| format!("encode failed: {e}"))?;

    let before = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let after = std::fs::metadata(&out_path).map(|m| m.len()).unwrap_or(0);
    Ok(CompressResult { path: out_path, before, after })
}

/// Encode an RGB8 frame to baseline JPEG bytes at `quality` (0..100). Shared with
/// `pdf_build` (images→PDF embeds the same way).
pub(crate) fn encode_jpeg(rgb: &image::RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, quality)
        .write_image(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("encode failed: {e}"))?;
    Ok(buf)
}

/// Place pre-encoded JPEG bytes (`px_w`×`px_h`) onto a page as a DCTDecode image
/// XObject with `transform`. Shared by compress (dpi from the render scale) and
/// images→PDF (`pdf_build`, dpi/translate from the page fit).
pub(crate) fn embed_jpeg(
    doc: &PdfDocumentReference,
    page: PdfPageIndex,
    layer: PdfLayerIndex,
    px_w: usize,
    px_h: usize,
    jpeg: Vec<u8>,
    transform: ImageTransform,
) {
    let xobject = ImageXObject {
        width: Px(px_w),
        height: Px(px_h),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: jpeg,
        image_filter: Some(ImageFilter::DCT),
        clipping_bbox: None,
        smask: None,
    };
    Image::from(xobject).add_to_layer(doc.get_page(page).get_layer(layer), transform);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn light_keeps_most_quality() {
        assert_eq!(compress_params("light"), (2.0, 80));
    }

    #[test]
    fn strong_compresses_hardest() {
        assert_eq!(compress_params("strong"), (1.0, 50));
    }

    #[test]
    fn unknown_level_falls_back_to_balanced() {
        assert_eq!(compress_params("nonsense"), (1.5, 65));
        assert_eq!(compress_params("balanced"), (1.5, 65));
    }

    #[test]
    fn higher_level_means_smaller_scale_and_quality() {
        let (sl, ql) = compress_params("light");
        let (sb, qb) = compress_params("balanced");
        let (ss, qs) = compress_params("strong");
        assert!(sl > sb && sb > ss, "scale must decrease light→strong");
        assert!(ql > qb && qb > qs, "quality must decrease light→strong");
    }
}
