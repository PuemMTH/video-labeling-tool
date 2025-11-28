import { createSignal, onMount, onCleanup, Show, Component } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Router, Route } from "@solidjs/router";
import "./App.css";

import Sidebar from "./components/Sidebar";
import Editor from "./pages/Editor";
import Summary from "./pages/Summary";
import {
  appStats,
  setAppStats,
  uiFps,
  setUiFps,
  fps,
  currentVideo,
  AppStats
} from "./store";
import { loadVideos } from "./actions";

const Layout: Component<any> = (props) => {
  // Load saved folder on mount
  onMount(async () => {
    const savedPath = localStorage.getItem("lastFolder");
    if (savedPath) {
      console.log("Loading saved folder:", savedPath);
      await loadVideos(savedPath);
    }

    // Polling for stats
    const statsInterval = setInterval(async () => {
      try {
        const stats = await invoke<AppStats>("get_app_stats");
        setAppStats(stats);
      } catch (e) {
        console.error("Failed to get stats:", e);
      }
    }, 1000);

    // UI FPS Counter
    let frames = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setUiFps(frames);
        frames = 0;
        lastTime = now;
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);

    onCleanup(() => {
      clearInterval(statsInterval);
      cancelAnimationFrame(animationFrameId);
    });
  });

  return (
    <div class="h-screen w-screen bg-base-200 flex flex-col">
      {/* Top Bar */}
      <div class="bg-base-100 shadow-sm px-4 py-2 flex justify-between items-center z-10 border-b border-base-300">
        <div class="font-bold text-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-primary">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
          </svg>
          Video Labeler
          <Show when={currentVideo()}>
            <span class="text-base-content/30 mx-2">|</span>
            <span class="text-base font-normal text-base-content/80">
              {currentVideo()?.path.split(/[/\\]/).pop()}
            </span>
          </Show>
        </div>
        <div class="flex gap-6 text-xs font-mono bg-base-200 px-3 py-1 rounded-full opacity-80">
          <div class="flex items-center gap-2" title="UI Frames Per Second">
            <span class="font-bold text-primary">UI FPS:</span>
            <span>{uiFps()}</span>
          </div>
          <div class="flex items-center gap-2" title="Video Frames Per Second">
            <span class="font-bold text-secondary">Video FPS:</span>
            <span>{fps()?.toFixed(2) || "0.0"}</span>
          </div>
          <div class="flex items-center gap-2" title="CPU Usage">
            <span class="font-bold text-accent">CPU:</span>
            <span>{appStats()?.cpu_usage.toFixed(1) || "0.0"}%</span>
          </div>
          <div class="flex items-center gap-2" title="GPU Usage">
            <span class="font-bold text-warning">GPU:</span>
            <span>{appStats()?.gpu_usage.toFixed(0) || "0"}%</span>
          </div>
          <div class="flex items-center gap-2" title="Memory Usage">
            <span class="font-bold text-info">RAM:</span>
            <span>{appStats() ? (appStats()!.memory_usage / 1024 / 1024).toFixed(0) : "0"} MB</span>
          </div>
        </div>
      </div>

      <div class="flex-1 p-4 overflow-hidden">
        <div class="grid grid-cols-12 gap-4 h-full">
          {/* Column 1: Sidebar */}
          <Sidebar />

          {/* Router Outlet */}
          {props.children}
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={Editor} />
      <Route path="/summary" component={Summary} />
    </Router>
  );
}

export default App;
