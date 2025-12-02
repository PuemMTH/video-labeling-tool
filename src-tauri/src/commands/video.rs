use crate::models::{VideoEntry, VideoMetadata};
use crate::state::VideoRegistry;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::thread;
use tauri::{Emitter};

#[cfg(target_os = "windows")]
fn get_duration_windows(path: &str) -> Option<f64> {
    use windows::{
        core::{PCWSTR, HSTRING, GUID},
        Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
        Win32::UI::Shell::PropertiesSystem::{IPropertyStore, GPS_DEFAULT, PROPERTYKEY, SHGetPropertyStoreFromParsingName},
        Win32::System::Variant::VT_UI8,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let path_hstring = HSTRING::from(path);
        let store: Result<IPropertyStore, _> = SHGetPropertyStoreFromParsingName(
            PCWSTR(path_hstring.as_ptr()),
            None,
            GPS_DEFAULT,
        );

        let duration = if let Ok(store) = store {
            let pkey = PROPERTYKEY {
                fmtid: GUID::from_u128(0x64440492_4C8B_11D1_8B70_080036B11A03),
                pid: 3,
            };

            if let Ok(prop) = store.GetValue(&pkey) {
                // Manual PROPVARIANT access for windows 0.52
                // Structure is usually: prop.Anonymous.Anonymous.vt
                // But let's try to be safe with pattern matching if possible, or direct access.
                // In 0.52:
                // prop.Anonymous.Anonymous.vt is the type
                // prop.Anonymous.Anonymous.Anonymous.uhVal is the u64 value
                
                let variant = &prop.Anonymous.Anonymous;
                if variant.vt == VT_UI8 {
                     let val = variant.Anonymous.uhVal;
                     Some(val as f64 / 10_000_000.0)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        CoUninitialize();
        duration
    }
}

#[cfg(not(target_os = "windows"))]
fn get_duration_windows(_path: &str) -> Option<f64> {
    None
}

fn get_mp4_metadata_internal(path: &std::path::Path) -> Result<(f64, f64), String> {
    use std::io::BufReader;

    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let reader = BufReader::new(file);

    let mp4 = mp4::Mp4Reader::read_header(reader, size).map_err(|e| e.to_string())?;

    let duration = mp4.duration().as_secs_f64();
    let mut fps = 0.0;
    
    for track in mp4.tracks().values() {
        if let Ok(mp4::TrackType::Video) = track.track_type() {
            let duration = track.duration();
            if !duration.is_zero() {
                let duration_sec = duration.as_secs_f64();
                if duration_sec > 0.0 {
                    fps = track.sample_count() as f64 / duration_sec;
                }
            }
            break;
        }
    }

    Ok((duration, fps))
}

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
                            // We focus on MP4/MOV for metadata, but list others
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

                                    // 1. Try Windows Shell API (Fastest, cached by OS)
                                    let mut duration_sec = get_duration_windows(path_str).unwrap_or(0.0);

                                    // 2. Fallback to Smart Scan if Windows API failed (e.g. not indexed)
                                    if duration_sec == 0.0 {
                                        let (mp4_dur, _) = get_mp4_metadata_internal(&path).unwrap_or((0.0, 0.0));
                                        duration_sec = mp4_dur;
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
    let path_buf = PathBuf::from(&path);
    let (duration, fps) = get_mp4_metadata_internal(&path_buf)
        .map_err(|e| format!("Failed to read MP4 metadata: {}", e))?;

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
