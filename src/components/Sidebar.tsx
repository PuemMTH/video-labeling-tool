import { Component, For, Show, createMemo } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { videos, currentVideo, sortBy, setSortBy, sortDirection, setSortDirection, SortBy, SortDirection } from "../store";
import { handleOpenFolder, handleVideoSelect } from "../actions";

const Sidebar: Component = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const sortedVideos = createMemo(() => {
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

    const toggleSort = (field: SortBy) => {
        if (sortBy() === field) {
            setSortDirection(sortDirection() === "asc" ? "desc" : "asc");
        } else {
            setSortBy(field);
            setSortDirection("asc");
        }
    };

    return (
        <div class="col-span-3 bg-base-100 rounded-box shadow-lg flex flex-col overflow-hidden h-full">
            <div class="p-4 border-b border-base-300 flex flex-col gap-2">
                <div class="flex gap-2">
                    <button class="btn btn-primary flex-1" onClick={handleOpenFolder}>
                        Open Folder
                    </button>
                    <button
                        class={`btn ${location.pathname === "/summary" ? "btn-active" : "btn-ghost"}`}
                        onClick={() => {
                            if (location.pathname === "/summary") {
                                navigate("/");
                            } else {
                                navigate("/summary");
                            }
                        }}
                        title="Toggle Summary View"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </button>
                </div>
                <div class="flex gap-1 justify-between text-xs">
                    <button
                        class={`btn btn-xs ${sortBy() === "name" ? "btn-active" : "btn-ghost"}`}
                        onClick={() => toggleSort("name")}
                    >
                        Name {sortBy() === "name" && (sortDirection() === "asc" ? "↑" : "↓")}
                    </button>
                    <button
                        class={`btn btn-xs ${sortBy() === "duration" ? "btn-active" : "btn-ghost"}`}
                        onClick={() => toggleSort("duration")}
                    >
                        Dur {sortBy() === "duration" && (sortDirection() === "asc" ? "↑" : "↓")}
                    </button>
                    <button
                        class={`btn btn-xs ${sortBy() === "date" ? "btn-active" : "btn-ghost"}`}
                        onClick={() => toggleSort("date")}
                    >
                        Date {sortBy() === "date" && (sortDirection() === "asc" ? "↑" : "↓")}
                    </button>
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2">
                <ul class="menu bg-base-100 w-full rounded-box">
                    <li class="menu-title">Videos ({videos().length})</li>
                    <For each={sortedVideos()}>
                        {(video) => (
                            <li>
                                <a
                                    class={`flex justify-between items-center ${currentVideo()?.path === video.path ? "bg-base-300 font-bold" : ""}`}
                                    onClick={() => {
                                        handleVideoSelect(video);
                                        navigate("/");
                                    }}
                                >
                                    <div class="flex flex-col">
                                        <span>{video.path.split(/[/\\]/).pop()}</span>
                                        <span class="text-xs opacity-50">
                                            {Math.floor(video.duration_sec / 60)}:
                                            {(video.duration_sec % 60).toFixed(0).padStart(2, "0")}
                                        </span>
                                    </div>
                                    <Show when={video.event_count > 0}>
                                        <div class="badge badge-sm badge-success">{video.event_count}</div>
                                    </Show>
                                </a>
                            </li>
                        )}
                    </For>
                </ul>
            </div>
        </div>
    );
};

export default Sidebar;
