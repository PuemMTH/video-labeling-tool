use crate::state::VideoRegistry;
use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::io::SeekFrom;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tower_http::cors::CorsLayer;

async fn serve_video(
    State(registry): State<VideoRegistry>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let path = {
        let registry = registry.lock().unwrap();
        match registry.get(&id) {
            Some(p) => p.clone(),
            None => {
                println!("Video not found in registry: {}", id);
                return (StatusCode::NOT_FOUND, "Video not found").into_response();
            }
        }
    };

    println!("Serving video: {:?}", path);

    // Get file size
    let metadata = match tokio::fs::metadata(&path).await {
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
                let mut file = match tokio::fs::File::open(&path).await {
                    Ok(f) => f,
                    Err(_) => {
                        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to open file")
                            .into_response()
                    }
                };

                if file.seek(SeekFrom::Start(start)).await.is_err() {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Seek failed").into_response();
                }

                let chunk_size = (end - start + 1) as usize;
                let mut buffer = vec![0u8; chunk_size];
                if file.read_exact(&mut buffer).await.is_err() {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Read failed").into_response();
                }

                return axum::response::Response::builder()
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::CONTENT_TYPE, content_type)
                    .header(header::CONTENT_LENGTH, chunk_size.to_string())
                    .header(
                        header::CONTENT_RANGE,
                        format!("bytes {}-{}/{}", start, end, file_size),
                    )
                    .header(header::ACCEPT_RANGES, "bytes")
                    .header(header::CACHE_CONTROL, "public, max-age=31536000")
                    .body(axum::body::Body::from(buffer))
                    .unwrap()
                    .into_response();
            }
        }
    }

    // No range request - send full file
    let file = match tokio::fs::read(&path).await {
        Ok(data) => data,
        Err(_) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response()
        }
    };

    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, file_size.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "public, max-age=31536000")
        .body(axum::body::Body::from(file))
        .unwrap()
        .into_response()
}

pub async fn start_video_server(registry: VideoRegistry) {
    let app = Router::new()
        .route("/video/:id", get(serve_video))
        .layer(CorsLayer::permissive())
        .with_state(registry);

    let listener = match tokio::net::TcpListener::bind("127.0.0.1:3030").await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind to port 3030: {}", e);
            return;
        }
    };

    println!("Video server listening on http://127.0.0.1:3030");

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
}
