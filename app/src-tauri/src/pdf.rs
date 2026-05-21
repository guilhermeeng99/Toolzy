use std::path::{Path, PathBuf};

use pdfium_render::prelude::*;
use tauri::Manager;

/// Locate and bind the pdfium library, trying (in order): the bundled resource
/// dir, the executable's own dir (dev / portable), then a system install.
fn bind_pdfium(app: &tauri::AppHandle) -> Result<Pdfium, String> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        dirs.push(res.join("pdfium"));
        dirs.push(res);
    }
    if let Some(parent) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
        dirs.push(parent);
    }
    for dir in dirs {
        if let Ok(b) = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&dir)) {
            return Ok(Pdfium::new(b));
        }
    }
    Pdfium::bind_to_system_library()
        .map(Pdfium::new)
        .map_err(|e| format!("pdfium library not found: {e}"))
}

/// Render each PDF page to an image (png | jpg) next to the source file and
/// return the saved paths. `scale` (1..4) controls resolution.
#[tauri::command]
pub fn pdf_to_images(
    app: tauri::AppHandle,
    path: String,
    format: String,
    scale: Option<f32>,
) -> Result<Vec<String>, String> {
    let pdfium = bind_pdfium(&app)?;
    let src = Path::new(&path);
    let doc = pdfium
        .load_pdf_from_file(src, None)
        .map_err(|e| format!("decode failed: {e}"))?;

    let ext = if format == "jpg" { "jpg" } else { "png" };
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("page");
    let factor = scale.unwrap_or(2.0).clamp(1.0, 4.0);
    let config = PdfRenderConfig::new().scale_page_by_factor(factor);

    let pages = doc.pages();
    let pad = (pages.len() as usize).to_string().len().max(2);
    let mut saved = Vec::new();
    for (index, page) in pages.iter().enumerate() {
        let image = page
            .render_with_config(&config)
            .map_err(|e| format!("encode failed: {e}"))?
            .as_image();
        let name = format!("{stem}-{:0pad$}.{ext}", index + 1, pad = pad);
        let dest = src.with_file_name(name);
        image
            .save(&dest)
            .map_err(|e| format!("encode failed: {e}"))?;
        saved.push(dest.to_string_lossy().to_string());
    }
    Ok(saved)
}
