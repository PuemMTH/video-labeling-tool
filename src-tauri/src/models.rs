use serde::Serialize;

#[derive(Serialize)]
pub struct VideoEntry {
    pub path: String,
    pub event_count: usize,
    pub duration_sec: f64,
    pub last_modified: u64,
}

#[derive(Serialize)]
pub struct VideoMetadata {
    pub fps: f64,
    pub duration: f64,
}

#[derive(Serialize)]
pub struct AppStats {
    pub cpu_usage: f32,
    pub memory_usage: u64,
    pub total_memory: u64,
    pub gpu_usage: f32,
}

#[derive(Serialize)]
pub struct GlobalEvent {
    pub video_name: String,
    pub label: String,
    pub start_frame: usize,
    pub end_frame: usize,
    pub fps: f64,
}

#[derive(Serialize)]
pub struct LabelSummary {
    pub total_videos: usize,
    pub total_labeled_videos: usize,
    pub total_events: usize,
    pub events: Vec<GlobalEvent>,
}
