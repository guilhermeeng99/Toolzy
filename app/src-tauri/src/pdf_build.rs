use std::io::BufWriter;
use std::path::Path;

use image::ImageReader;
use printpdf::{
    ColorBits, ColorSpace, Image, ImageTransform, ImageXObject, Mm, PdfDocumentReference,
    PdfLayerIndex, PdfPageIndex, Px,
};

// 1 px at 72 dpi -> millimetres. Pages are sized to the image (1:1 at 72 dpi).
const MM_PER_PX: f32 = 25.4 / 72.0;

/// Combine one or more images into a single PDF (one image per page) and write it
/// to `out_path`. Pages match each image's pixel size at 72 dpi.
#[tauri::command]
pub fn images_to_pdf(paths: Vec<String>, out_path: String) -> Result<String, String> {
    let first = paths.first().ok_or("no images provided")?;
    let (w, h, raw) = load_rgb(first)?;
    let (doc, page, layer) =
        printpdf::PdfDocument::new("Toolzy", Mm(w as f32 * MM_PER_PX), Mm(h as f32 * MM_PER_PX), "Layer 1");
    draw(&doc, page, layer, w, h, raw);

    for path in &paths[1..] {
        let (w, h, raw) = load_rgb(path)?;
        let (page, layer) =
            doc.add_page(Mm(w as f32 * MM_PER_PX), Mm(h as f32 * MM_PER_PX), "Layer 1");
        draw(&doc, page, layer, w, h, raw);
    }

    let file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
    doc.save(&mut BufWriter::new(file))
        .map_err(|e| format!("encode failed: {e}"))?;
    Ok(out_path)
}

/// Decode an image to raw RGB8 (printpdf embeds the raw pixels as an image XObject).
fn load_rgb(path: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let img = ImageReader::open(Path::new(path))
        .map_err(|e| format!("open failed: {e}"))?
        .with_guessed_format()
        .map_err(|e| format!("read failed: {e}"))?
        .decode()
        .map_err(|e| format!("decode failed: {e}"))?
        .to_rgb8();
    Ok((img.width(), img.height(), img.into_raw()))
}

fn draw(doc: &PdfDocumentReference, page: PdfPageIndex, layer: PdfLayerIndex, w: u32, h: u32, raw: Vec<u8>) {
    let xobject = ImageXObject {
        width: Px(w as usize),
        height: Px(h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: raw,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    };
    let current = doc.get_page(page).get_layer(layer);
    Image::from(xobject).add_to_layer(current, ImageTransform { dpi: Some(72.0), ..Default::default() });
}
