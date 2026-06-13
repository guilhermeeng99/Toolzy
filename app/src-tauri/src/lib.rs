mod audio_edit;
mod download;
mod ffmpeg;
mod image_convert;
mod link_transcription;
mod media;
mod pdf;
mod pdf_build;
mod pdf_compress;
mod pdf_merge;
mod pdf_protect;
mod qpdf;
mod thumbnail;
mod transcription;
mod validate;
mod video_edit;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(transcription::TranscribeState::default())
        .invoke_handler(tauri::generate_handler![
            image_convert::convert_image,
            pdf::pdf_to_images,
            pdf_build::images_to_pdf,
            pdf_compress::compress_pdf,
            thumbnail::make_thumbnail,
            pdf_merge::merge_pdfs,
            pdf_protect::add_pdf_password,
            pdf_protect::remove_pdf_password,
            media::convert_media,
            ffmpeg::probe_duration,
            audio_edit::trim_audio,
            audio_edit::change_audio_volume,
            audio_edit::change_audio_speed,
            video_edit::trim_video,
            video_edit::merge_videos,
            video_edit::add_audio_to_video,
            video_edit::rotate_video,
            video_edit::mirror_video,
            video_edit::change_video_speed,
            video_edit::compress_video,
            download::probe_media,
            download::download_media,
            link_transcription::transcribe_link,
            transcription::transcribe_audio,
            transcription::list_whisper_models,
            transcription::download_whisper_model,
            transcription::cancel_transcription,
            transcription::gpu_engine_status,
            transcription::download_gpu_engine
        ])
        .run(tauri::generate_context!())
        .expect("error while running Toolzy");
}
