import { createSignal } from "solid-js";

export interface VideoEntry {
    path: string;
    event_count: number;
    duration_sec: number;
    last_modified: number;
}

export interface VideoMetadata {
    fps: number;
    duration: number;
}

export interface LabelEvent {
    label: string;
    start_frame: number;
    end_frame: number;
    before_start_frame: number;
}

export interface AppStats {
    cpu_usage: number;
    memory_usage: number;
    total_memory: number;
    gpu_usage: number;
}

export interface GlobalEvent {
    video_name: string;
    label: string;
    start_frame: number;
    end_frame: number;
    fps: number;
}

export interface LabelSummary {
    total_videos: number;
    total_labeled_videos: number;
    total_events: number;
    events: GlobalEvent[];
}

export type SortBy = "name" | "duration" | "date";
export type SortDirection = "asc" | "desc";

// Global State
export const [videos, setVideos] = createSignal<VideoEntry[]>([]);
export const [currentVideo, setCurrentVideo] = createSignal<VideoEntry | null>(null);
export const [videoSrc, setVideoSrc] = createSignal<string | null>(null);
export const [events, setEvents] = createSignal<LabelEvent[]>([]);
export const [fps, setFps] = createSignal<number>(0);
export const [duration, setDuration] = createSignal<number>(0);
export const [totalFrames, setTotalFrames] = createSignal<number>(0);
export const [appStats, setAppStats] = createSignal<AppStats | null>(null);
export const [uiFps, setUiFps] = createSignal<number>(0);
export const [summaryData, setSummaryData] = createSignal<LabelSummary | null>(null);
export const [sortBy, setSortBy] = createSignal<SortBy>("name");
export const [sortDirection, setSortDirection] = createSignal<SortDirection>("asc");
export const [targetFrame, setTargetFrame] = createSignal<number | null>(null);
export const [scrollSensitivity, setScrollSensitivity] = createSignal<number>(1);
export const [preloadProgress, setPreloadProgress] = createSignal<Map<string, number>>(new Map());

import { createMemo } from "solid-js";
export const sortedVideos = createMemo(() => {
    const list = [...videos()];
    const sort = sortBy();
    const direction = sortDirection();

    return list.sort((a, b) => {
        let res = 0;
        if (sort === "name") {
            res = a.path.localeCompare(b.path);
        } else if (sort === "duration") {
            res = a.duration_sec - b.duration_sec;
        } else if (sort === "date") {
            res = a.last_modified - b.last_modified;
        }
        return direction === "asc" ? res : -res;
    });
});
