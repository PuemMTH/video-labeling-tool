import { Component, onMount, Show, For, createSignal, createMemo } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "@solidjs/router";
import { summaryData, setSummaryData, LabelSummary, videos, setTargetFrame } from "../store";
import { handleVideoSelect } from "../actions";

type SortField = "video_name" | "label" | "start_frame" | "duration";
type SortDirection = "asc" | "desc";

const Summary: Component = () => {
    const [sortField, setSortField] = createSignal<SortField>("video_name");
    const [sortDirection, setSortDirection] = createSignal<SortDirection>("asc");
    const navigate = useNavigate();

    onMount(async () => {
        const path = localStorage.getItem("lastFolder");
        if (path) {
            try {
                const summary = await invoke<LabelSummary>("get_label_summary", { path });
                setSummaryData(summary);
            } catch (e) {
                console.error("Failed to load summary:", e);
            }
        }
    });

    const sortedEvents = createMemo(() => {
        const events = summaryData()?.events || [];
        const field = sortField();
        const direction = sortDirection();

        return [...events].sort((a, b) => {
            let res = 0;
            if (field === "video_name") {
                res = a.video_name.localeCompare(b.video_name);
            } else if (field === "label") {
                res = a.label.localeCompare(b.label);
            } else if (field === "start_frame") {
                res = a.start_frame - b.start_frame;
            } else if (field === "duration") {
                const durA = a.end_frame - a.start_frame;
                const durB = b.end_frame - b.start_frame;
                res = durA - durB;
            }
            return direction === "asc" ? res : -res;
        });
    });

    const handleSort = (field: SortField) => {
        if (sortField() === field) {
            setSortDirection(sortDirection() === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    };

    const SortIcon = (props: { field: SortField }) => (
        <span class="ml-1 inline-block w-4">
            {sortField() === props.field ? (sortDirection() === "asc" ? "↑" : "↓") : ""}
        </span>
    );

    return (
        <div class="col-span-9 bg-base-100 rounded-box shadow-lg flex flex-col p-4 overflow-hidden">
            <div class="flex flex-col h-full overflow-hidden">
                <h2 class="text-2xl font-bold mb-4">Label Summary</h2>
                <Show when={summaryData()} fallback={<div class="loading loading-spinner"></div>}>
                    <div class="grid grid-cols-3 gap-4 mb-6">
                        <div class="stat bg-base-200 rounded-box">
                            <div class="stat-title">Total Videos</div>
                            <div class="stat-value">{summaryData()?.total_videos}</div>
                        </div>
                        <div class="stat bg-base-200 rounded-box">
                            <div class="stat-title">Labeled Videos</div>
                            <div class="stat-value text-primary">{summaryData()?.total_labeled_videos}</div>
                        </div>
                        <div class="stat bg-base-200 rounded-box">
                            <div class="stat-title">Total Events</div>
                            <div class="stat-value text-secondary">{summaryData()?.total_events}</div>
                        </div>
                    </div>

                    <div class="flex-1 overflow-auto">
                        <table class="table table-zebra w-full table-pin-rows">
                            <thead>
                                <tr class="cursor-pointer select-none">
                                    <th onClick={() => handleSort("video_name")}>
                                        Video Name <SortIcon field="video_name" />
                                    </th>
                                    <th onClick={() => handleSort("label")}>
                                        Label <SortIcon field="label" />
                                    </th>
                                    <th onClick={() => handleSort("start_frame")}>
                                        Start Frame <SortIcon field="start_frame" />
                                    </th>
                                    <th>End Frame</th>
                                    <th onClick={() => handleSort("duration")}>
                                        Duration (Frames) <SortIcon field="duration" />
                                    </th>
                                    <th>Duration (Seconds)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={sortedEvents()}>
                                    {(event) => (
                                        <tr
                                            class="hover cursor-pointer"
                                            onClick={() => {
                                                const video = videos().find(v => v.path.includes(event.video_name));
                                                if (video) {
                                                    handleVideoSelect(video);
                                                    setTargetFrame(event.start_frame);
                                                    navigate("/");
                                                }
                                            }}
                                        >
                                            <td class="font-bold">{event.video_name}</td>
                                            <td><div class="badge badge-outline">{event.label}</div></td>
                                            <td>{event.start_frame}</td>
                                            <td>{event.end_frame}</td>
                                            <td>{event.end_frame - event.start_frame}</td>
                                            <td>{((event.end_frame - event.start_frame) / event.fps).toFixed(2)}s</td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </div>
        </div>
    );
};

export default Summary;
