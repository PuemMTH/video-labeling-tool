import { Component, onMount, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { summaryData, setSummaryData, LabelSummary } from "../store";

const Summary: Component = () => {
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
                        <table class="table table-zebra w-full">
                            <thead>
                                <tr>
                                    <th>Video Name</th>
                                    <th>Label</th>
                                    <th>Start Frame</th>
                                    <th>End Frame</th>
                                    <th>Duration (Frames)</th>
                                    <th>Duration (Seconds)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={summaryData()?.events}>
                                    {(event) => (
                                        <tr>
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
