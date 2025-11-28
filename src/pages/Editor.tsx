import { Component, createSignal, onMount, onCleanup, Show, For } from "solid-js";
import {
    currentVideo,
    videoSrc,
    fps,
    duration,
    totalFrames,
    events,
    setEvents,
    setVideos,
    videos,
    LabelEvent,
    targetFrame,
    setTargetFrame,
    scrollSensitivity,
    setScrollSensitivity
} from "../store";
import { saveLabels, handleDeleteEvent } from "../actions";

const Editor: Component = () => {
    let videoRef: HTMLVideoElement | undefined;
    const [isRecording, setIsRecording] = createSignal(false);
    const [startFrame, setStartFrame] = createSignal<number | null>(null);
    const [currentFrame, setCurrentFrame] = createSignal<number>(0);

    onMount(() => {
        const handleKeyPress = async (e: KeyboardEvent) => {
            // Spacebar: Play/Pause
            if (e.code === "Space" && videoRef) {
                e.preventDefault();
                if (videoRef.paused) {
                    videoRef.play();
                } else {
                    videoRef.pause();
                }
            }

            // 'w': Mark start/end frame
            if (e.key.toLowerCase() === "w" && videoRef && fps() > 0 && currentVideo()) {
                e.preventDefault();
                const frame = Math.round(videoRef.currentTime * fps());

                if (!isRecording()) {
                    // Start recording
                    setIsRecording(true);
                    setStartFrame(frame);
                } else {
                    // Stop recording and save
                    setIsRecording(false);
                    const start = startFrame();
                    if (start !== null) {
                        const beforeStart = Math.max(0, Math.round(start - (5 * fps())));
                        const newEvent: LabelEvent = {
                            label: "accident", // Default label
                            start_frame: start,
                            end_frame: frame,
                            before_start_frame: beforeStart
                        };

                        const newEvents = [...events(), newEvent];
                        setEvents(newEvents);

                        // Optimistic update
                        const current = currentVideo()!;
                        setVideos(videos().map(v =>
                            v.path === current.path ? { ...v, event_count: v.event_count + 1 } : v
                        ));
                        // We can't easily update currentVideo event_count without triggering effects, 
                        // but since it's a signal in store, we can just update the list and maybe the current ref?
                        // Actually currentVideo is a signal. We should update it too if we want UI to reflect.
                        // But let's leave it for now, the list update is enough for Sidebar.

                        // Save to file in background
                        saveLabels(current.path, newEvents, fps()).catch(console.error);
                    }
                    setStartFrame(null);
                }
            }
        };

        const handleWheel = (e: WheelEvent) => {
            // Check if the target is within a scrollable area
            const target = e.target as HTMLElement;
            if (target.closest('.overflow-y-auto')) {
                return; // Let default scroll happen
            }

            if (videoRef && fps() > 0 && currentVideo()) {
                e.preventDefault();
                const frameDelta = Math.sign(e.deltaY) * scrollSensitivity();
                const timeDelta = frameDelta / fps();
                videoRef.currentTime = Math.max(0, Math.min(duration(), videoRef.currentTime + timeDelta));
            }
        };

        window.addEventListener("keydown", handleKeyPress);
        window.addEventListener("wheel", handleWheel, { passive: false });
        onCleanup(() => {
            window.removeEventListener("keydown", handleKeyPress);
            window.removeEventListener("wheel", handleWheel);
        });
    });

    return (
        <>
            {/* Column 2: Video Player */}
            <div class="col-span-6 bg-base-100 rounded-box shadow-lg flex flex-col p-4">
                <Show when={currentVideo()} fallback={<div class="flex items-center justify-center h-full text-base-content/50">Select a video to preview</div>}>
                    <Show when={videoSrc()}>
                        <div class="flex flex-col w-full gap-2">
                            <video
                                ref={videoRef}
                                controls
                                src={videoSrc()!}
                                class="w-full h-full object-contain rounded-lg"
                                preload="metadata"
                                onTimeUpdate={() => {
                                    if (videoRef && fps() > 0) {
                                        setCurrentFrame(Math.round(videoRef.currentTime * fps()));
                                    }
                                }}
                                onLoadStart={() => console.log("✓ Video load started")}
                                onLoadedMetadata={() => console.log("✓ Video metadata loaded")}
                                onCanPlay={() => {
                                    console.log("✓ Video ready to play");
                                    const target = targetFrame();
                                    if (target !== null && fps() > 0) {
                                        if (videoRef) {
                                            videoRef.currentTime = target / fps();
                                            setTargetFrame(null);
                                        }
                                    }
                                }}
                                onError={(e) => {
                                    console.error("✗ Video error:", e);
                                    console.error("✗ Error details:", e.currentTarget.error);
                                }}
                            />
                            <div class="text-center py-2 flex flex-col gap-2">
                                <div class="text-lg font-semibold">
                                    {currentVideo()?.path.split(/[/\\]/).pop()}
                                </div>

                                {/* Scroll Sensitivity Control */}
                                <div class="flex items-center justify-center gap-2 text-xs">
                                    <span>Scroll Sensitivity:</span>
                                    <input
                                        type="range"
                                        min="1"
                                        max="30"
                                        value={scrollSensitivity()}
                                        class="range range-xs range-primary w-24"
                                        onInput={(e) => setScrollSensitivity(parseInt(e.currentTarget.value))}
                                    />
                                    <span>{scrollSensitivity()} frames</span>
                                </div>

                                <Show when={isRecording()}>
                                    <div class="text-error font-bold animate-pulse">
                                        ● Recording Event... (Press 'w' to stop)
                                    </div>
                                </Show>
                                <Show when={!isRecording() && fps() > 0}>
                                    <div class="text-sm text-base-content/70">
                                        Press 'w' to start marking an event
                                    </div>
                                </Show>
                            </div>
                            {/* Timeline Bar */}
                            <Show when={totalFrames() > 0}>
                                <div class="w-full h-4 bg-base-300 rounded-full mt-2 relative overflow-hidden cursor-pointer"
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        const timeline = e.currentTarget;
                                        const rect = timeline.getBoundingClientRect();

                                        const updateTime = (clientX: number) => {
                                            if (videoRef && duration() > 0) {
                                                const x = clientX - rect.left;
                                                const percentage = Math.max(0, Math.min(1, x / rect.width));
                                                videoRef.currentTime = percentage * duration();
                                            }
                                        };

                                        updateTime(e.clientX);

                                        const onMove = (moveEvent: PointerEvent) => {
                                            updateTime(moveEvent.clientX);
                                        };

                                        const onUp = () => {
                                            window.removeEventListener('pointermove', onMove);
                                            window.removeEventListener('pointerup', onUp);
                                        };

                                        window.addEventListener('pointermove', onMove);
                                        window.addEventListener('pointerup', onUp);
                                    }}
                                >
                                    {/* Current Progress */}
                                    <div
                                        class="absolute top-0 left-0 h-full bg-base-content/20 pointer-events-none"
                                        style={{ width: `${(currentFrame() / totalFrames()) * 100}%` }}
                                    ></div>

                                    {/* Events */}
                                    <For each={events()}>
                                        {(event) => {
                                            const startPercent = (event.start_frame / totalFrames()) * 100;
                                            const endPercent = (event.end_frame / totalFrames()) * 100;
                                            const beforeStartPercent = (event.before_start_frame / totalFrames()) * 100;

                                            return (
                                                <>
                                                    {/* Warning Zone (Orange) */}
                                                    <div
                                                        class="absolute top-0 h-full bg-warning/70"
                                                        style={{
                                                            left: `${beforeStartPercent}%`,
                                                            width: `${startPercent - beforeStartPercent}%`
                                                        }}
                                                        title={`Warning: ${event.label}`}
                                                    ></div>
                                                    {/* Active Zone (Red) */}
                                                    <div
                                                        class="absolute top-0 h-full bg-error/70"
                                                        style={{
                                                            left: `${startPercent}%`,
                                                            width: `${endPercent - startPercent}%`
                                                        }}
                                                        title={`Event: ${event.label}`}
                                                    ></div>
                                                </>
                                            );
                                        }}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    </Show>
                </Show>
            </div>

            {/* Column 3: Annotations */}
            <div class="col-span-3 bg-base-100 rounded-box shadow-lg flex flex-col overflow-hidden">
                <div class="p-4 border-b border-base-300">
                    <h2 class="text-xl font-bold">Annotations</h2>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    <div class="overflow-x-auto">
                        <table class="table table-zebra w-full">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Label</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For each={events()}>
                                    {(event, index) => (
                                        <tr
                                            class={`hover cursor-pointer ${currentFrame() >= event.start_frame && currentFrame() <= event.end_frame
                                                ? "bg-error text-error-content"
                                                : currentFrame() >= event.before_start_frame && currentFrame() < event.start_frame
                                                    ? "bg-warning text-warning-content"
                                                    : ""
                                                }`}
                                            onClick={() => {
                                                if (videoRef) {
                                                    videoRef.currentTime = event.start_frame / fps();
                                                }
                                            }}
                                        >
                                            <td>{event.start_frame} - {event.end_frame}</td>
                                            <td>{event.label}</td>
                                            <td>
                                                <button
                                                    class="btn btn-ghost btn-xs text-error"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteEvent(index());
                                                    }}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                                                        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Editor;
