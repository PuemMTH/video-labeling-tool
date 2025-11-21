import { createSignal, For, Show, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

function App() {
  const [videos, setVideos] = createSignal<string[]>([]);
  const [currentVideo, setCurrentVideo] = createSignal<string | null>(null);
  const [videoSrc, setVideoSrc] = createSignal<string | null>(null);

  // Load saved folder on mount
  onMount(async () => {
    const savedPath = localStorage.getItem("lastFolder");
    if (savedPath) {
      console.log("Loading saved folder:", savedPath);
      await loadVideos(savedPath);
    }
  });

  async function loadVideos(path: string) {
    try {
      const videoPaths = await invoke<string[]>("scan_videos", { path });
      setVideos(videoPaths);
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

  async function handleVideoSelect(videoPath: string) {
    setCurrentVideo(videoPath);

    console.log("Selected video:", videoPath);

    try {
      // Register video with HTTP server
      const url = await invoke<string>("register_video", { path: videoPath });
      console.log("Video URL:", url);
      setVideoSrc(url);
    } catch (error) {
      console.error("Failed to register video:", error);
    }
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
                      class={currentVideo() === video ? "active" : ""}
                      onClick={() => handleVideoSelect(video)}
                    >
                      {video.split(/[/\\]/).pop()}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>

        {/* Column 2: Video Player */}
        <div class="col-span-6 bg-base-100 rounded-box shadow-lg flex flex-col items-center justify-center p-4">
          <Show when={currentVideo()} fallback={<div class="text-base-content/50">Select a video to preview</div>}>
            <div class="w-full h-full flex flex-col items-center justify-center">
              <Show when={videoSrc()}>
                <video
                  controls
                  src={videoSrc()!}
                  class="max-w-full max-h-[80vh] rounded-lg shadow-md"
                  preload="metadata"
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
                <div class="mt-4 text-center">
                  <div class="text-lg font-semibold">
                    {currentVideo()?.split(/[/\\]/).pop()}
                  </div>
                </div>
              </Show>
            </div>
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
                  </tr>
                </thead>
                <tbody>
                  {/* Mock Data */}
                  <tr>
                    <td>00:05</td>
                    <td>Person</td>
                  </tr>
                  <tr>
                    <td>00:12</td>
                    <td>Car</td>
                  </tr>
                  <tr>
                    <td>00:45</td>
                    <td>Dog</td>
                  </tr>
                  <tr>
                    <td>01:20</td>
                    <td>Bicycle</td>
                  </tr>
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
