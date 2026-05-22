use std::io::Cursor;
use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat};
use pdfium_render::prelude::*;

use crate::pdf::bind_pdfium;

/// Render a small preview of an image or a PDF's first page as a PNG **data URL**
/// the webview can show directly (`<img src=…>`, allowed by the `data:` CSP). Used
/// by the grid pickers (images→PDF, merge). PDFs need the pdfium library.
#[tauri::command]
pub fn make_thumbnail(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();

    let image = if ext == "pdf" {
        render_pdf_first_page(&app, &path)?
    } else {
        image::ImageReader::open(&path)
            .map_err(|e| format!("open failed: {e}"))?
            .with_guessed_format()
            .map_err(|e| format!("read failed: {e}"))?
            .decode()
            .map_err(|e| format!("decode failed: {e}"))?
    };

    encode_png_data_url(&image.thumbnail(320, 420))
}

/// Rasterize the first page of a PDF at a small scale for the preview.
fn render_pdf_first_page(app: &tauri::AppHandle, path: &str) -> Result<DynamicImage, String> {
    let pdfium = bind_pdfium(app)?;
    let doc = pdfium
        .load_pdf_from_file(Path::new(path), None)
        .map_err(|e| format!("decode failed: {e}"))?;
    // Bind `pages` so the temporary lives long enough to render from it.
    let pages = doc.pages();
    let page = pages.iter().next().ok_or("empty pdf")?;
    let config = PdfRenderConfig::new().scale_page_by_factor(0.6);
    let image = page
        .render_with_config(&config)
        .map_err(|e| format!("render failed: {e}"))?
        .as_image();
    Ok(image)
}

fn encode_png_data_url(img: &DynamicImage) -> Result<String, String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| format!("encode failed: {e}"))?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(&buf)))
}
