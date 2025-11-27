import { Component, For, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { videos, currentVideo } from "../store";
import { handleOpenFolder, handleVideoSelect } from "../actions";

const Sidebar: Component = () => {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <div class="col-span-3 bg-base-100 rounded-box shadow-lg flex flex-col overflow-hidden h-full">
            <div class="p-4 border-b border-base-300 flex gap-2">
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
            <div class="flex-1 overflow-y-auto p-2">
                <ul class="menu bg-base-100 w-full rounded-box">
                    <li class="menu-title">Videos ({videos().length})</li>
                    <For each={videos()}>
                        {(video) => (
                            <li>
                                <a
                                    class={`flex justify-between items-center ${currentVideo()?.path === video.path ? "bg-base-300 font-bold" : ""}`}
                                    onClick={() => {
                                        handleVideoSelect(video);
                                        navigate("/");
                                    }}
                                >
                                    <span>{video.path.split(/[/\\]/).pop()}</span>
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
