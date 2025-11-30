use sha2::{Digest, Sha256};
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::thread;
use tauri::Manager;

#[tauri::command]
pub fn start_progressive_transcode(
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
        // Check for GPU support (NVENC)
        let mut cmd = Command::new("ffmpeg");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);

        let use_gpu = cmd
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=64x64:r=1",
                "-vframes",
                "1",
                "-an",
                "-c:v",
                "h264_nvenc",
                "-f",
                "null",
                "-",
            ])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        let mut args = vec![];

        if use_gpu {
            println!("Using GPU (h264_nvenc) for transcoding");
            // Enable hardware decoding if using GPU
            args.extend_from_slice(&[
                "-hwaccel".to_string(),
                "cuda".to_string(),
                "-hwaccel_output_format".to_string(),
                "cuda".to_string(),
            ]);

            args.extend_from_slice(&[
                "-i".to_string(),
                video_path_clone,
                "-c:v".to_string(),
                "h264_nvenc".to_string(),
                "-preset".to_string(),
                "p1".to_string(), // Fastest
                "-rc".to_string(),
                "constqp".to_string(),
                "-qp".to_string(),
                "28".to_string(),
            ]);
        } else {
            println!("Using CPU (libx264) for transcoding");
            args.extend_from_slice(&[
                "-i".to_string(),
                video_path_clone,
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                "ultrafast".to_string(),
                "-tune".to_string(),
                "zerolatency".to_string(),
                "-crf".to_string(),
                "28".to_string(),
            ]);
        }

        args.extend_from_slice(&[
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "128k".to_string(),
            "-movflags".to_string(),
            "+frag_keyframe+empty_moov+default_base_moof".to_string(),
            "-f".to_string(),
            "mp4".to_string(),
            "-y".to_string(),
            output_path_clone.to_string_lossy().to_string(),
        ]);

        let mut cmd = Command::new("ffmpeg");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);

        let _ = cmd
            .args(&args)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    });

    // Wait a moment for FFmpeg to start writing
    std::thread::sleep(std::time::Duration::from_millis(500));

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_transcode_progress(app: tauri::AppHandle, video_path: String) -> Result<f32, String> {
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
pub fn check_ffmpeg() -> Result<String, String> {
    let mut cmd = Command::new("ffmpeg");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
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
