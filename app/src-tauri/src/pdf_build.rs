use std::io::BufWriter;
use std::path::Path;

use image::DynamicImage;
use printpdf::{ImageTransform, Mm, PdfDocumentReference};
use serde::Deserialize;

use crate::pdf_compress::{embed_jpeg, encode_jpeg};

// 1 px at 72 dpi -> mm — used to size a page to its image in "fit" mode.
const MM_PER_PX: f32 = 25.4 / 72.0;
// Embedded-photo quality: clean-looking but keeps the PDF small (raw RGB would be huge).
const JPEG_QUALITY: u8 = 88;

/// One image to place, with a clockwise rotation in degrees (0/90/180/270).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageItem {
    pub path: String,
    #[serde(default)]
    pub rotation: u16,
}

/// Page layout for the generated PDF (mirrors the image→PDF options panel).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagesPdfOptions {
    pub page_size: String,   // "fit" | "a4" | "letter" | "legal"
    pub orientation: String, // "portrait" | "landscape"
    pub margin: String,      // "none" | "small" | "large"
    pub merge: bool,
}

/// Combine images into PDF(s). `merge` true → one multi-page PDF at `out_path`;
/// false → one PDF per image (`<stem>-N.pdf`). Each image is rotated, fitted to the
/// chosen page (or sized to itself for "fit"), and embedded as JPEG. Returns the
/// saved path(s).
#[tauri::command]
pub fn images_to_pdf(
    items: Vec<ImageItem>,
    options: ImagesPdfOptions,
    out_path: String,
) -> Result<Vec<String>, String> {
    if items.is_empty() {
        return Err("no images provided".into());
    }
    let dims = page_dims(&options.page_size, &options.orientation);
    let margin = margin_mm(&options.margin);

    if options.merge {
        save_doc(build_doc(&items, dims, margin)?, &out_path)?;
        return Ok(vec![out_path]);
    }

    let mut saved = Vec::new();
    for (i, item) in items.iter().enumerate() {
        let target = nth_path(&out_path, i, items.len());
        save_doc(build_doc(std::slice::from_ref(item), dims, margin)?, &target)?;
        saved.push(target);
    }
    Ok(saved)
}

/// Build a document with one page per item (rotated, fitted, embedded as JPEG).
fn build_doc(
    items: &[ImageItem],
    dims: Option<(f32, f32)>,
    margin: f32,
) -> Result<PdfDocumentReference, String> {
    let mut out: Option<PdfDocumentReference> = None;
    for item in items {
        let img = load_rotated(item)?;
        let (pw, ph) = (img.width(), img.height());
        let jpeg = encode_jpeg(&img.to_rgb8(), JPEG_QUALITY)?;
        let (page_w, page_h) = dims.unwrap_or((pw as f32 * MM_PER_PX, ph as f32 * MM_PER_PX));
        let transform = place(pw, ph, page_w, page_h, margin, dims.is_some());

        match &out {
            None => {
                let (doc, p, l) =
                    printpdf::PdfDocument::new("Toolzy", Mm(page_w), Mm(page_h), "Layer 1");
                embed_jpeg(&doc, p, l, pw as usize, ph as usize, jpeg, transform);
                out = Some(doc);
            }
            Some(doc) => {
                let (p, l) = doc.add_page(Mm(page_w), Mm(page_h), "Layer 1");
                embed_jpeg(doc, p, l, pw as usize, ph as usize, jpeg, transform);
            }
        }
    }
    out.ok_or_else(|| "no images provided".into())
}

/// Decode an image and apply its rotation.
fn load_rotated(item: &ImageItem) -> Result<DynamicImage, String> {
    let img = image::ImageReader::open(Path::new(&item.path))
        .map_err(|e| format!("open failed: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("read failed: {e}"))?
        .decode()
        .map_err(|e| format!("decode failed: {e}"))?;
    Ok(match item.rotation % 360 {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    })
}

/// Where/how big to draw the image. "fit" → fill the page at 72 dpi; fixed page →
/// contain inside the margins, centred.
fn place(img_w: u32, img_h: u32, page_w: f32, page_h: f32, margin: f32, fixed: bool) -> ImageTransform {
    if !fixed {
        return ImageTransform { dpi: Some(72.0), ..Default::default() };
    }
    let (bw, bh) = ((page_w - 2.0 * margin).max(1.0), (page_h - 2.0 * margin).max(1.0));
    let (dw, dh) = fit_contain(img_w, img_h, bw, bh);
    ImageTransform {
        translate_x: Some(Mm((page_w - dw) / 2.0)),
        translate_y: Some(Mm((page_h - dh) / 2.0)),
        dpi: Some(img_w as f32 * 25.4 / dw),
        ..Default::default()
    }
}

fn save_doc(doc: PdfDocumentReference, out_path: &str) -> Result<(), String> {
    let file = std::fs::File::create(out_path).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file))
        .map_err(|e| format!("encode failed: {e}"))
}

/// Page size in mm (portrait), swapped for landscape. `None` = size to the image.
fn page_dims(page_size: &str, orientation: &str) -> Option<(f32, f32)> {
    let portrait = match page_size {
        "a4" => (210.0, 297.0),
        "letter" => (215.9, 279.4),
        "legal" => (215.9, 355.6),
        _ => return None, // "fit"
    };
    Some(if orientation == "landscape" {
        (portrait.1, portrait.0)
    } else {
        portrait
    })
}

fn margin_mm(margin: &str) -> f32 {
    match margin {
        "small" => 10.0,
        "large" => 25.0,
        _ => 0.0,
    }
}

/// Largest (w, h) in mm that fits `iw`×`ih` (px) inside a `bw`×`bh` mm box, aspect kept.
fn fit_contain(iw: u32, ih: u32, bw: f32, bh: f32) -> (f32, f32) {
    let ar = iw as f32 / ih as f32;
    if ar > bw / bh {
        (bw, bw / ar)
    } else {
        (bh * ar, bh)
    }
}

/// Output path for the Nth image when not merging: `<stem>-N.pdf` (or `out_path`
/// itself for a single image).
fn nth_path(out_path: &str, index: usize, total: usize) -> String {
    if total <= 1 {
        return out_path.to_string();
    }
    let p = Path::new(out_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("toolzy");
    p.parent()
        .unwrap_or_else(|| Path::new(""))
        .join(format!("{stem}-{}.pdf", index + 1))
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a4_swaps_for_landscape() {
        assert_eq!(page_dims("a4", "portrait"), Some((210.0, 297.0)));
        assert_eq!(page_dims("a4", "landscape"), Some((297.0, 210.0)));
    }

    #[test]
    fn fit_has_no_fixed_dims() {
        assert_eq!(page_dims("fit", "portrait"), None);
        assert_eq!(page_dims("anything", "portrait"), None);
    }

    #[test]
    fn margins_map_to_mm() {
        assert_eq!(margin_mm("none"), 0.0);
        assert_eq!(margin_mm("small"), 10.0);
        assert_eq!(margin_mm("large"), 25.0);
    }

    #[test]
    fn contain_wide_image_fills_width() {
        assert_eq!(fit_contain(200, 100, 100.0, 100.0), (100.0, 50.0));
    }

    #[test]
    fn contain_tall_image_fills_height() {
        assert_eq!(fit_contain(100, 200, 100.0, 100.0), (50.0, 100.0));
    }

    #[test]
    fn nth_path_single_uses_out_path() {
        assert_eq!(nth_path("C:/x/out.pdf", 0, 1), "C:/x/out.pdf");
    }

    #[test]
    fn nth_path_multi_appends_index() {
        assert!(nth_path("C:/x/out.pdf", 1, 3).ends_with("out-2.pdf"));
    }

    #[test]
    fn place_fit_mode_uses_72_dpi_no_translate() {
        // "fit" page (fixed = false): fill at 72 dpi, no centering offset.
        let t = place(800, 600, 100.0, 100.0, 0.0, false);
        assert_eq!(t.dpi, Some(72.0));
        assert!(t.translate_x.is_none());
        assert!(t.translate_y.is_none());
    }

    #[test]
    fn place_fixed_page_centers_and_sets_dpi() {
        // 200x100 px into a 100x100 mm page, no margin: contains to 100x50 mm,
        // centred vertically (y = 25), flush left (x = 0); dpi = 200 * 25.4 / 100.
        let t = place(200, 100, 100.0, 100.0, 0.0, true);
        assert_eq!(t.translate_x.unwrap().0, 0.0);
        assert_eq!(t.translate_y.unwrap().0, 25.0);
        assert_eq!(t.dpi, Some(200.0 * 25.4 / 100.0));
    }
}
