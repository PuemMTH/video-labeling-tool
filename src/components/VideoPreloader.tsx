import { Component, createEffect, createSignal, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { currentVideo, setPreloadProgress, sortedVideos } from "../store";

const VideoPreloader: Component = () => {
    const [preloadItems, setPreloadItems] = createSignal<{ url: string; path: string }[]>([]);

    createEffect(async () => {
        const allVideos = sortedVideos(); // Use sorted list
        const current = currentVideo();

        if (allVideos.length === 0 || !current) {
            setPreloadItems([]);
            return;
        }

        const currentIndex = allVideos.findIndex(v => v.path === current.path);
        if (currentIndex === -1) return;

        // Find next 2 unlabeled videos
        const nextVideos = [];
        for (let i = currentIndex + 1; i < allVideos.length; i++) {
            if (allVideos[i].event_count === 0) {
                nextVideos.push(allVideos[i]);
                if (nextVideos.length >= 2) break;
            }
        }

        const items: { url: string; path: string }[] = [];
        for (const video of nextVideos) {
            try {
                // Preload header from backend to warm up OS cache
                await invoke("preload_video_header", { path: video.path });

                const url = await invoke<string>("register_video", { path: video.path });
                items.push({ url, path: video.path });
            } catch (e) {
                console.error("Failed to register video for preloading:", video.path, e);
            }
        }

        setPreloadItems(items);
    });

    return (
        <div style={{ display: "none" }}>
            <For each={preloadItems()}>
                {(item) => (
                    <video
                        src={item.url}
                        preload="auto"
                        muted
                        onLoadStart={() => console.log("Preloading started:", item.path)}
                        onProgress={(e) => {
                            const video = e.currentTarget;
                            if (video.duration > 0 && video.buffered.length > 0) {
                                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                                const progress = (bufferedEnd / video.duration) * 100;
                                setPreloadProgress(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(item.path, progress);
                                    return newMap;
                                });
                            }
                        }}
                        onCanPlay={() => {
                            console.log("Preloading ready:", item.path);
                            // Ensure we mark as at least somewhat loaded
                            setPreloadProgress(prev => {
                                const newMap = new Map(prev);
                                if (!newMap.has(item.path)) {
                                    newMap.set(item.path, 10); // Initial progress
                                }
                                return newMap;
                            });
                        }}
                        onError={(e) => console.error("Preloading failed:", item.path, e)}
                    />
                )}
            </For>
        </div>
    );
};

export default VideoPreloader;
