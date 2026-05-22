mod download;
mod image_convert;
mod media;
mod pdf;
mod pdf_build;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            image_convert::convert_image,
            pdf::pdf_to_images,
            pdf_build::images_to_pdf,
            media::convert_media,
            download::probe_media,
            download::download_media
        ])
        .run(tauri::generate_context!())
        .expect("error while running Toolzy");
}
