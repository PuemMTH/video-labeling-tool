pub mod commands;
pub mod models;
pub mod server;
pub mod state;

use commands::{labels, misc, system, transcode, video};
use nvml_wrapper::Nvml;
use state::{AppMonitorState, VideoRegistry};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use sysinfo::System;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let video_registry: VideoRegistry = Arc::new(Mutex::new(HashMap::new()));
    let registry_clone = video_registry.clone();

    let nvml = Nvml::init().ok();

    tauri::Builder::default()
        .manage(video_registry)
        .manage(AppMonitorState {
            system: Mutex::new(System::new_all()),
            nvml: Mutex::new(nvml),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            misc::greet,
            video::scan_videos,
            transcode::start_progressive_transcode,
            transcode::get_transcode_progress,
            transcode::check_ffmpeg,
            video::read_video_chunk,
            video::get_video_size,
            video::register_video,
            video::get_video_metadata,
            labels::save_video_labels,
            labels::load_video_labels,
            system::get_app_stats,
            labels::get_label_summary,
            video::preload_video_header
        ])
        .setup(|_app| {
            // Start video server after Tauri runtime is ready
            tauri::async_runtime::spawn(async move {
                server::start_video_server(registry_clone).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
