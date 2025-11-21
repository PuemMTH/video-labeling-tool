import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface VideoEntry {
  path: string;
  event_count: number;
}

interface VideoMetadata {
  fps: number;
  duration: number;
}

interface LabelEvent {
  label: string;
  start_frame: number;
  end_frame: number;
  before_start_frame: number;
}

function App() {
  const [videos, setVideos] = createSignal<VideoEntry[]>([]);
  const [currentVideo, setCurrentVideo] = createSignal<VideoEntry | null>(null);
  const [videoSrc, setVideoSrc] = createSignal<string | null>(null);
  const [events, setEvents] = createSignal<LabelEvent[]>([]);
  const [fps, setFps] = createSignal<number>(0);
  const [isRecording, setIsRecording] = createSignal(false);
  const [startFrame, setStartFrame] = createSignal<number | null>(null);
  const [currentFrame, setCurrentFrame] = createSignal<number>(0);
  const [duration, setDuration] = createSignal<number>(0);
  const [totalFrames, setTotalFrames] = createSignal<number>(0);
  let videoRef: HTMLVideoElement | undefined;

  // Load saved folder on mount
  onMount(async () => {
    const savedPath = localStorage.getItem("lastFolder");
    if (savedPath) {
      console.log("Loading saved folder:", savedPath);
      await loadVideos(savedPath);
    }

    // Add keyboard event listener
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
        const currentFrame = Math.round(videoRef.currentTime * fps());

        if (!isRecording()) {
          // Start recording
          setIsRecording(true);
          setStartFrame(currentFrame);
        } else {
          // Stop recording and save
          setIsRecording(false);
          const start = startFrame();
          if (start !== null) {
            const beforeStart = Math.max(0, Math.round(start - (5 * fps())));
            const newEvent: LabelEvent = {
              label: "accident", // Default label as per request
              start_frame: start,
              end_frame: currentFrame,
              before_start_frame: beforeStart
            };

            const newEvents = [...events(), newEvent];
            setEvents(newEvents);

            // Save to file
            await saveLabels(currentVideo()!.path, newEvents, fps());

            // Update video list count
            setVideos(videos().map(v =>
              v.path === currentVideo()!.path ? { ...v, event_count: v.event_count + 1 } : v
            ));

            // Update current video state
            setCurrentVideo({ ...currentVideo()!, event_count: currentVideo()!.event_count + 1 });
          }
          setStartFrame(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyPress);
    });
  });

  async function loadVideos(path: string) {
    try {
      const videoEntries = await invoke<VideoEntry[]>("scan_videos", { path });
      setVideos(videoEntries);
      setCurrentVideo(null);
      setVideoSrc(null);
      localStorage.setItem("lastFolder", path);
    } catch (error) {
      console.error("Error scanning videos:", error);
    }
  }

  async function handleOpenFolder() {
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

  async function handleVideoSelect(entry: VideoEntry) {
    setCurrentVideo(entry);
    setEvents([]);
    setIsRecording(false);
    setStartFrame(null);

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

  async function saveLabels(videoPath: string, currentEvents: LabelEvent[], currentFps: number) {
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

  async function handleDeleteEvent(index: number) {
    if (!currentVideo()) return;

    const newEvents = [...events()];
    newEvents.splice(index, 1);
    setEvents(newEvents);

    await saveLabels(currentVideo()!.path, newEvents, fps());

    // Update video list count
    setVideos(videos().map(v =>
      v.path === currentVideo()!.path ? { ...v, event_count: Math.max(0, v.event_count - 1) } : v
    ));
    setCurrentVideo({ ...currentVideo()!, event_count: Math.max(0, currentVideo()!.event_count - 1) });
  }

  return (
    <div class="h-screen w-screen bg-base-200 p-4">
      <div class="grid grid-cols-12 gap-4 h-full">
        {/* Column 1: File List */}
        <div class="col-span-3 bg-base-100 rounded-box shadow-lg flex flex-col overflow-hidden">
          <div class="p-4 border-b border-base-300">
            <button class="btn btn-primary w-full" onClick={handleOpenFolder}>
              Open Folder
            </button>
          </div>
          <div class="flex-1 overflow-y-auto p-2">
            <ul class="menu bg-base-100 w-full rounded-box">
              <li class="menu-title">Videos ({videos().length})</li>
              <For each={videos()}>
                {(video) => (
                  <li>
                    <a
                      class={`flex justify-between items-center ${currentVideo()?.path === video.path ? "active" : ""}`}
                      onClick={() => handleVideoSelect(video)}
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

        {/* Column 2: Video Player */}
        <div class="col-span-6 bg-base-100 rounded-box shadow-lg flex flex-col p-4">
          <Show when={currentVideo()} fallback={<div class="flex items-center justify-center h-full text-base-content/50">Select a video to preview</div>}>
            <Show when={videoSrc()}>
              <div class="flex flex-col h-full gap-2">
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
                  onCanPlay={() => console.log("✓ Video ready to play")}
                  onError={(e) => {
                    console.error("✗ Video error:", e);
                    console.error("✗ Error details:", e.currentTarget.error);
                    console.error("✗ Error code:", e.currentTarget.error?.code);
                    console.error("✗ Error message:", e.currentTarget.error?.message);
                  }}
                />
                <div class="text-center py-2">
                  <div class="text-lg font-semibold">
                    {currentVideo()?.path.split(/[/\\]/).pop()}
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
                    onClick={(e) => {
                      if (videoRef && fps() > 0) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = x / rect.width;
                        videoRef.currentTime = percentage * duration();
                      }
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

        {/* Column 3: Annotations (Mockup) */}
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
            <div class="mt-4">
              <button class="btn btn-outline btn-sm w-full">Add Annotation</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
