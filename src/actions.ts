import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
    setVideos,
    setCurrentVideo,
    setVideoSrc,
    setEvents,
    setFps,
    setDuration,
    setTotalFrames,
    videos,
    currentVideo,
    events,
    fps,
    VideoEntry,
    VideoMetadata,
    LabelEvent
} from "./store";

import { listen } from "@tauri-apps/api/event";

let unlistenVideoFound: (() => void) | null = null;
let unlistenScanComplete: (() => void) | null = null;

export async function loadVideos(path: string) {
    try {
        setVideos([]);
        setCurrentVideo(null);
        setVideoSrc(null);
        localStorage.setItem("lastFolder", path);

        if (unlistenVideoFound) {
            unlistenVideoFound();
            unlistenVideoFound = null;
        }
        if (unlistenScanComplete) {
            unlistenScanComplete();
            unlistenScanComplete = null;
        }

        unlistenVideoFound = await listen<VideoEntry>("video-found", (event) => {
            setVideos((prev) => [...prev, event.payload]);
        });

        unlistenScanComplete = await listen("scan-complete", () => {
            if (unlistenVideoFound) {
                unlistenVideoFound();
                unlistenVideoFound = null;
            }
            if (unlistenScanComplete) {
                unlistenScanComplete();
                unlistenScanComplete = null;
            }
        });

        await invoke("scan_videos", { path });
    } catch (error) {
        console.error("Error scanning videos:", error);
    }
}

export async function handleOpenFolder() {
    console.log("Opening folder dialog...");
    try {
        const selected = await open({
            directory: true,
            multiple: false,
        });
        console.log("Selected path:", selected);

        if (selected && typeof selected === "string") {
            await loadVideos(selected);
        }
    } catch (error) {
        console.error("Error opening folder:", error);
    }
}

export async function handleVideoSelect(entry: VideoEntry) {
    setCurrentVideo(entry);
    setEvents([]);
    // setIsRecording(false); // Managed locally in Editor
    // setStartFrame(null); // Managed locally in Editor

    console.log("Selected video:", entry.path);

    try {
        // Register video
        const url = await invoke<string>("register_video", { path: entry.path });
        setVideoSrc(url);

        // Get metadata (FPS)
        const metadata = await invoke<VideoMetadata>("get_video_metadata", { path: entry.path });
        setFps(metadata.fps);
        setDuration(metadata.duration);
        setTotalFrames(Math.round(metadata.duration * metadata.fps));
        console.log("FPS:", metadata.fps, "Duration:", metadata.duration);

        // Load labels if exist
        const labelContent = await invoke<string | null>("load_video_labels", { videoPath: entry.path });
        if (labelContent) {
            try {
                const parsed = JSON.parse(labelContent);
                if (parsed.events) {
                    setEvents(parsed.events);
                }
            } catch (e) {
                console.error("Failed to parse labels:", e);
            }
        }
    } catch (error) {
        console.error("Error loading video details:", error);
    }
}

export async function saveLabels(videoPath: string, currentEvents: LabelEvent[], currentFps: number) {
    try {
        const content = JSON.stringify({
            video_name: videoPath.split(/[/\\]/).pop(),
            fps: currentFps,
            events: currentEvents
        }, null, 4);

        await invoke("save_video_labels", {
            videoPath: videoPath,
            jsonContent: content
        });
    } catch (error) {
        console.error("Failed to save labels:", error);
    }
}

export async function handleDeleteEvent(index: number) {
    const current = currentVideo();
    if (!current) return;

    const newEvents = [...events()];
    newEvents.splice(index, 1);
    setEvents(newEvents);

    // Optimistic update
    setVideos(videos().map(v =>
        v.path === current.path ? { ...v, event_count: Math.max(0, v.event_count - 1) } : v
    ));
    setCurrentVideo({ ...current, event_count: Math.max(0, current.event_count - 1) });

    // Save in background
    saveLabels(current.path, newEvents, fps()).catch(console.error);
}
