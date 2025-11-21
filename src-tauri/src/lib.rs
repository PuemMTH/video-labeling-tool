// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn scan_videos(path: String) -> Vec<String> {
    let mut videos = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    if let Some(extension) = path.extension() {
                        let ext = extension.to_string_lossy().to_lowercase();
                        if ["mp4", "webm", "mkv", "avi", "mov"].contains(&ext.as_str()) {
                            if let Some(path_str) = path.to_str() {
                                videos.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    videos
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, scan_videos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
