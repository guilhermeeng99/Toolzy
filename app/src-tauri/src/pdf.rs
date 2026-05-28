use std::path::{Path, PathBuf};

use pdfium_render::prelude::*;
use tauri::Manager;

/// Locate and bind the pdfium library, trying (in order): the bundled resource
/// dir, the executable's own dir (dev / portable), then a system install.
/// `pub(crate)` so the compress command can reuse the same lookup.
pub(crate) fn bind_pdfium(app: &tauri::AppHandle) -> Result<Pdfium, String> {
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
    let total = pages.len() as usize;
    let mut saved = Vec::new();
    for (index, page) in pages.iter().enumerate() {
        let image = page
            .render_with_config(&config)
            .map_err(|e| format!("encode failed: {e}"))?
            .as_image()
            .map_err(|e| format!("encode failed: {e}"))?;
        let dest = src.with_file_name(page_image_name(stem, index, total, ext));
        image
            .save(&dest)
            .map_err(|e| format!("encode failed: {e}"))?;
        saved.push(dest.to_string_lossy().to_string());
    }
    Ok(saved)
}

/// Page image filename `<stem>-<n>.<ext>`: `n` is 1-based and zero-padded to the
/// width of `total` (min 2) so the files sort naturally (page 1 of 9 → `stem-01`,
/// page 10 of 120 → `stem-010`). Pure → unit-tested.
fn page_image_name(stem: &str, index: usize, total: usize, ext: &str) -> String {
    let pad = total.to_string().len().max(2);
    format!("{stem}-{:0pad$}.{ext}", index + 1, pad = pad)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_name_is_one_based_and_min_two_pad() {
        assert_eq!(page_image_name("doc", 0, 1, "png"), "doc-01.png");
        assert_eq!(page_image_name("doc", 8, 9, "png"), "doc-09.png");
    }

    #[test]
    fn page_name_widens_pad_with_total() {
        assert_eq!(page_image_name("doc", 9, 10, "jpg"), "doc-10.jpg");
        assert_eq!(page_image_name("doc", 98, 99, "png"), "doc-99.png");
        assert_eq!(page_image_name("doc", 99, 100, "png"), "doc-100.png");
    }
}
