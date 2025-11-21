use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Manager;
use tower_http::cors::CorsLayer;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
struct VideoEntry {
    path: String,
    event_count: usize,
}

#[tauri::command]
fn scan_videos(path: String) -> Vec<VideoEntry> {
    let mut videos = Vec::new();
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

                                videos.push(VideoEntry {
                                    path: path_str.to_string(),
                                    event_count,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    videos
}

#[tauri::command]
fn start_progressive_transcode(
    app: tauri::AppHandle,
    video_path: String,
) -> Result<String, String> {
    // Create cache directory
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;

    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    // Generate hash for cache key
    let mut hasher = Sha256::new();
    hasher.update(video_path.as_bytes());
    let hash = hex::encode(hasher.finalize());

    let output_path = cache_dir.join(format!("{}.mp4", hash));

    // If already transcoded, return immediately
    if output_path.exists() {
        let metadata = std::fs::metadata(&output_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        if metadata.len() > 1024 * 1024 {
            // At least 1MB means it's likely complete
            return Ok(output_path.to_string_lossy().to_string());
        }
    }

    // Start FFmpeg in background with progressive encoding
    let output_path_clone = output_path.clone();
    let video_path_clone = video_path.clone();

    thread::spawn(move || {
        let _ = Command::new("ffmpeg")
            .args([
                "-i",
                &video_path_clone,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast", // Ultra fast for streaming
                "-tune",
                "zerolatency", // Optimize for low latency
                "-crf",
                "28", // Slightly lower quality for speed
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+frag_keyframe+empty_moov+default_base_moof", // Progressive streaming
                "-f",
                "mp4",
                "-y",
                output_path_clone.to_string_lossy().as_ref(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    });

    // Wait a moment for FFmpeg to start writing
    std::thread::sleep(std::time::Duration::from_millis(500));

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_transcode_progress(app: tauri::AppHandle, video_path: String) -> Result<f32, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;

    let mut hasher = Sha256::new();
    hasher.update(video_path.as_bytes());
    let hash = hex::encode(hasher.finalize());

    let output_path = cache_dir.join(format!("{}.mp4", hash));

    if !output_path.exists() {
        return Ok(0.0);
    }

    let output_size = std::fs::metadata(&output_path)
        .map_err(|e| format!("Failed to read file: {}", e))?
        .len();

    // Rough estimate: assume transcoded file is similar size to original
    let input_size = std::fs::metadata(&video_path)
        .map_err(|e| format!("Failed to read input: {}", e))?
        .len();

    if input_size == 0 {
        return Ok(0.0);
    }

    let progress = (output_size as f64 / input_size as f64).min(1.0) as f32;
    Ok(progress)
}

#[tauri::command]
fn check_ffmpeg() -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map_err(|_| "FFmpeg not found. Please install FFmpeg.".to_string())?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout);
        let first_line = version.lines().next().unwrap_or("FFmpeg installed");
        Ok(first_line.to_string())
    } else {
        Err("FFmpeg not working properly".to_string())
    }
}

#[tauri::command]
fn read_video_chunk(path: String, start: usize, end: usize) -> Result<Vec<u8>, String> {
    let data = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let end = end.min(data.len());
    let chunk = data.get(start..end).ok_or("Invalid range")?.to_vec();

    Ok(chunk)
}

#[tauri::command]
fn get_video_size(path: String) -> Result<u64, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file size: {}", e))?;
    Ok(metadata.len())
}

// Video registry for HTTP server
type VideoRegistry = Arc<Mutex<HashMap<String, PathBuf>>>;

async fn serve_video(
    State(registry): State<VideoRegistry>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let registry = registry.lock().unwrap();
    let path = match registry.get(&id) {
        Some(p) => p.clone(),
        None => return (StatusCode::NOT_FOUND, "Video not found").into_response(),
    };
    drop(registry);

    // Get file size
    let metadata = match fs::metadata(&path) {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };
    let file_size = metadata.len();

    // Detect content type from extension
    let content_type = match path.extension().and_then(|e| e.to_str()) {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("mov") => "video/quicktime",
        Some("flv") => "video/x-flv",
        Some("wmv") => "video/x-ms-wmv",
        _ => "video/mp4", // default
    };

    // Parse Range header
    let range_header = headers.get(header::RANGE);

    if let Some(range) = range_header {
        // Parse "bytes=start-end"
        let range_str = range.to_str().unwrap_or("");
        if let Some(range_value) = range_str.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_value.split('-').collect();
            if parts.len() == 2 {
                let start: u64 = parts[0].parse().unwrap_or(0);
                let end: u64 = if parts[1].is_empty() {
                    file_size - 1
                } else {
                    parts[1].parse().unwrap_or(file_size - 1).min(file_size - 1)
                };

                // Read chunk
                let mut file = match fs::File::open(&path) {
                    Ok(f) => f,
                    Err(_) => {
                        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file")
                            .into_response()
                    }
                };

                use std::io::{Read, Seek, SeekFrom};
                if file.seek(SeekFrom::Start(start)).is_err() {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Seek failed").into_response();
                }

                let chunk_size = (end - start + 1) as usize;
                let mut buffer = vec![0u8; chunk_size];
                if file.read_exact(&mut buffer).is_err() {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Read failed").into_response();
                }

                return (
                    StatusCode::PARTIAL_CONTENT,
                    [
                        (header::CONTENT_TYPE, content_type),
                        (header::CONTENT_LENGTH, &chunk_size.to_string()),
                        (
                            header::CONTENT_RANGE,
                            &format!("bytes {}-{}/{}", start, end, file_size),
                        ),
                        (header::ACCEPT_RANGES, "bytes"),
                        (header::CACHE_CONTROL, "public, max-age=31536000"),
                    ],
                    buffer,
                )
                    .into_response();
            }
        }
    }

    // No range request - send full file
    let file = match fs::read(&path) {
        Ok(data) => data,
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
        }
    };

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type),
            (header::CONTENT_LENGTH, &file_size.to_string()),
            (header::ACCEPT_RANGES, "bytes"),
            (header::CACHE_CONTROL, "public, max-age=31536000"),
        ],
        file,
    )
        .into_response()
}

async fn start_video_server(registry: VideoRegistry) {
    let app = Router::new()
        .route("/video/:id", get(serve_video))
        .layer(CorsLayer::permissive())
        .with_state(registry);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3030")
        .await
        .unwrap();

    println!("Video server listening on http://127.0.0.1:3030");

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
}

#[tauri::command]
fn register_video(registry: tauri::State<VideoRegistry>, path: String) -> Result<String, String> {
    let mut reg = registry.lock().unwrap();

    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let id = hex::encode(hasher.finalize())[..16].to_string();

    reg.insert(id.clone(), PathBuf::from(path));

    Ok(format!("http://127.0.0.1:3030/video/{}", id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let video_registry: VideoRegistry = Arc::new(Mutex::new(HashMap::new()));
    let registry_clone = video_registry.clone();

    tauri::Builder::default()
        .manage(video_registry)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            scan_videos,
            start_progressive_transcode,
            get_transcode_progress,
            check_ffmpeg,
            read_video_chunk,
            get_video_size,
            register_video,
            get_video_metadata,
            save_video_labels,
            load_video_labels
        ])
        .setup(|_app| {
            // Start video server after Tauri runtime is ready
            tauri::async_runtime::spawn(async move {
                start_video_server(registry_clone).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(serde::Serialize)]
struct VideoMetadata {
    fps: f64,
    duration: f64,
}

#[tauri::command]
fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    let output = Command::new("ffprobe")
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
fn save_video_labels(video_path: String, json_content: String) -> Result<(), String> {
    let video_path = PathBuf::from(video_path);
    let parent = video_path.parent().ok_or("Invalid video path")?;
    let file_stem = video_path.file_stem().ok_or("Invalid file name")?;

    let json_filename = format!("{}.json", file_stem.to_string_lossy());
    let json_path = parent.join(json_filename);

    fs::write(&json_path, json_content).map_err(|e| format!("Failed to write labels: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_video_labels(video_path: String) -> Result<Option<String>, String> {
    let video_path = PathBuf::from(video_path);
    let parent = video_path.parent().ok_or("Invalid video path")?;
    let file_stem = video_path.file_stem().ok_or("Invalid file name")?;

    let json_filename = format!("{}.json", file_stem.to_string_lossy());
    let json_path = parent.join(json_filename);

    if json_path.exists() {
        let content =
            fs::read_to_string(&json_path).map_err(|e| format!("Failed to read labels: {}", e))?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}
