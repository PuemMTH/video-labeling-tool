use crate::state::VideoRegistry;
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use tower::util::ServiceExt;
use tower_http::{cors::CorsLayer, services::ServeFile};

async fn serve_video(
    State(registry): State<VideoRegistry>,
    Path(id): Path<String>,
    req: Request,
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

    match ServeFile::new(path).oneshot(req).await {
        Ok(res) => res.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to serve file: {}", err),
        )
            .into_response(),
    }
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
