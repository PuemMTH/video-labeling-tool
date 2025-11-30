use crate::models::{VideoEntry, VideoMetadata};
use crate::state::VideoRegistry;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use tauri::{Emitter, Manager};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
pub fn scan_videos(app: tauri::AppHandle, path: String) {
    thread::spawn(move || {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(extension) = path.extension() {
                            let ext = extension.to_string_lossy().to_lowercase();
                            if ["mp4", "webm", "mkv", "avi", "mov", "flv", "wmv", "m4v"]
                                .contains(&ext.as_str())
                            {
                                if let Some(path_str) = path.to_str() {
                                    let file_stem = path.file_stem().unwrap_or_default();
                                    let json_path = path.with_file_name(format!(
                                        "{}.json",
                                        file_stem.to_string_lossy()
                                    ));

                                    let mut event_count = 0;
                                    if json_path.exists() {
                                        if let Ok(content) = std::fs::read_to_string(&json_path) {
                                            if let Ok(json) =
                                                serde_json::from_str::<serde_json::Value>(&content)
                                            {
                                                if let Some(events) = json["events"].as_array() {
                                                    event_count = events.len();
                                                }
                                            }
                                        }
                                    }

                                    let mut duration_sec = 0.0;
                                    let mut cmd = Command::new("ffprobe");
                                    #[cfg(target_os = "windows")]
                                    cmd.creation_flags(0x08000000);
                                    
                                    if let Ok(output) = cmd
                                        .args([
                                            "-v",
                                            "error",
                                            "-show_entries",
                                            "format=duration",
                                            "-of",
                                            "default=noprint_wrappers=1:nokey=1",
                                            path_str,
                                        ])
                                        .output()
                                    {
                                        if output.status.success() {
                                            let duration_str = String::from_utf8_lossy(&output.stdout);
                                            duration_sec = duration_str.trim().parse().unwrap_or(0.0);
                                        }
                                    }

                                    let last_modified = std::fs::metadata(&path)
                                        .and_then(|m| m.modified())
                                        .ok()
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .map(|d| d.as_secs())
                                        .unwrap_or(0);

                                    let video_entry = VideoEntry {
                                        path: path_str.to_string(),
                                        event_count,
                                        duration_sec,
                                        last_modified,
                                    };

                                    let _ = app.emit("video-found", video_entry);
                                }
                            }
                        }
                    }
                }
            }
        }
        let _ = app.emit("scan-complete", ());
    });
}

#[tauri::command]
pub fn read_video_chunk(path: String, start: usize, end: usize) -> Result<Vec<u8>, String> {
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let end = end.min(data.len());
    let chunk = data.get(start..end).ok_or("Invalid range")?.to_vec();

    Ok(chunk)
}

#[tauri::command]
pub fn get_video_size(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file size: {}", e))?;
    Ok(metadata.len())
}

#[tauri::command]
pub fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    let mut cmd = Command::new("ffprobe");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate,duration",
            "-of",
            "json",
            &path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    println!("ffprobe output for {}: {}", path, output_str);
    let json: serde_json::Value =
        serde_json::from_str(&output_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let stream = &json["streams"][0];

    // Parse FPS (e.g., "30/1" or "29.97")
    let r_frame_rate = stream["r_frame_rate"].as_str().ok_or("FPS not found")?;

    let fps = if r_frame_rate.contains('/') {
        let parts: Vec<&str> = r_frame_rate.split('/').collect();
        if parts.len() == 2 {
            let num: f64 = parts[0].parse().unwrap_or(0.0);
            let den: f64 = parts[1].parse().unwrap_or(1.0);
            if den == 0.0 {
                0.0
            } else {
                num / den
            }
        } else {
            0.0
        }
    } else {
        r_frame_rate.parse().unwrap_or(0.0)
    };

    let duration: f64 = stream["duration"]
        .as_str()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0.0);

    Ok(VideoMetadata { fps, duration })
}

#[tauri::command]
pub fn register_video(
    registry: tauri::State<VideoRegistry>,
    path: String,
) -> Result<String, String> {
    let mut reg = registry.lock().unwrap();

    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let id = hex::encode(hasher.finalize())[..16].to_string();

    reg.insert(id.clone(), PathBuf::from(path));

    Ok(format!("http://127.0.0.1:3030/video/{}", id))
}

#[tauri::command]
pub fn preload_video_header(path: String) -> Result<(), String> {
    use std::io::Read;

    // Read first 5MB to warm up OS cache
    let chunk_size = 5 * 1024 * 1024;
    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buffer = vec![0; chunk_size];

    // We don't care about the result, just want to trigger read
    let _ = file.read(&mut buffer);

    Ok(())
}
