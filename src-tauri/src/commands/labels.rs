use crate::models::{GlobalEvent, LabelSummary};
use std::path::PathBuf;

#[tauri::command]
pub async fn save_video_labels(video_path: String, json_content: String) -> Result<(), String> {
    let video_path = PathBuf::from(video_path);
    let parent = video_path.parent().ok_or("Invalid video path")?;
    let file_stem = video_path.file_stem().ok_or("Invalid file name")?;

    let json_filename = format!("{}.json", file_stem.to_string_lossy());
    let json_path = parent.join(json_filename);

    tokio::fs::write(&json_path, json_content)
        .await
        .map_err(|e| format!("Failed to write labels: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn load_video_labels(video_path: String) -> Result<Option<String>, String> {
    let video_path = PathBuf::from(video_path);
    let parent = video_path.parent().ok_or("Invalid video path")?;
    let file_stem = video_path.file_stem().ok_or("Invalid file name")?;

    let json_filename = format!("{}.json", file_stem.to_string_lossy());
    let json_path = parent.join(json_filename);

    if json_path.exists() {
        let content = tokio::fs::read_to_string(&json_path)
            .await
            .map_err(|e| format!("Failed to read labels: {}", e))?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_label_summary(path: String) -> LabelSummary {
    let mut summary = LabelSummary {
        total_videos: 0,
        total_labeled_videos: 0,
        total_events: 0,
        events: Vec::new(),
    };

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
                            summary.total_videos += 1;

                            let file_stem = path.file_stem().unwrap_or_default();
                            let json_path = path
                                .with_file_name(format!("{}.json", file_stem.to_string_lossy()));

                            if json_path.exists() {
                                if let Ok(content) = std::fs::read_to_string(&json_path) {
                                    if let Ok(json) =
                                        serde_json::from_str::<serde_json::Value>(&content)
                                    {
                                        let fps = json["fps"].as_f64().unwrap_or(30.0);
                                        if let Some(events) = json["events"].as_array() {
                                            if !events.is_empty() {
                                                summary.total_labeled_videos += 1;
                                            }
                                            for event in events {
                                                summary.total_events += 1;
                                                summary.events.push(GlobalEvent {
                                                    video_name: file_stem
                                                        .to_string_lossy()
                                                        .to_string(),
                                                    label: event["label"]
                                                        .as_str()
                                                        .unwrap_or("unknown")
                                                        .to_string(),
                                                    start_frame: event["start_frame"]
                                                        .as_u64()
                                                        .unwrap_or(0)
                                                        as usize,
                                                    end_frame: event["end_frame"]
                                                        .as_u64()
                                                        .unwrap_or(0)
                                                        as usize,
                                                    fps,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    summary
}
